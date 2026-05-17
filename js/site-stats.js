import { supabase } from './supabase.js'

const FALLBACK_STATS = { clientes: 0, productos: 0, marcas: 0, rubros: 0, rubrosDetalle: {} }
const CACHE_MS = 30000

let cachedStats = null
let cachedAt = 0
let pendingStats = null

function cleanNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function normalizeStats(stats = {}) {
  return {
    clientes: cleanNumber(stats.clientes),
    productos: cleanNumber(stats.productos),
    marcas: cleanNumber(stats.marcas),
    rubros: cleanNumber(stats.rubros),
    rubrosDetalle: Object.fromEntries(
      Object.entries(stats.rubros_detalle || stats.rubrosDetalle || {})
        .map(([key, value]) => [key, cleanNumber(value)])
    ),
  }
}

async function countPublicTable(table) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })

  if (error) throw error
  return cleanNumber(count)
}

async function fetchStatsFromPublicTables() {
  const [productos, marcas, rubros] = await Promise.all([
    countPublicTable('productos').catch(error => {
      console.warn('[site-stats] No se pudo contar productos.', error)
      return 0
    }),
    countPublicTable('marcas').catch(error => {
      console.warn('[site-stats] No se pudo contar marcas.', error)
      return 0
    }),
    countPublicTable('categorias').catch(error => {
      console.warn('[site-stats] No se pudo contar rubros.', error)
      return 0
    }),
  ])

  return { ...FALLBACK_STATS, productos, marcas, rubros }
}

export async function getPublicSiteStats({ force = false } = {}) {
  const now = Date.now()
  if (!force && cachedStats && now - cachedAt < CACHE_MS) return cachedStats
  if (!force && pendingStats) return pendingStats

  pendingStats = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_public_site_stats')
      if (error) throw error
      cachedStats = normalizeStats(data)
    } catch (error) {
      console.warn('[site-stats] RPC get_public_site_stats falló. Usando fallback público.', error)
      cachedStats = normalizeStats(await fetchStatsFromPublicTables().catch(() => FALLBACK_STATS))
    } finally {
      cachedAt = Date.now()
      pendingStats = null
    }
    return cachedStats
  })()

  return pendingStats
}

export function formatStat(value) {
  return cleanNumber(value).toLocaleString('es-AR')
}

export function renderStatNumber(el, value) {
  if (!el) return
  el.textContent = formatStat(value)
}

export function startPublicStatsAutoRefresh(callback, intervalMs = 60000) {
  let stopped = false

  async function refresh(force = false) {
    try {
      const stats = await getPublicSiteStats({ force })
      if (!stopped) callback(stats)
    } catch (error) {
      console.warn('[site-stats] No se pudieron actualizar las métricas públicas.', error)
      if (!stopped) callback(FALLBACK_STATS)
    }
  }

  refresh(true)
  const timer = window.setInterval(() => refresh(true), intervalMs)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh(true)
  })

  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}
