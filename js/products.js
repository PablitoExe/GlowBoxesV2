import { supabase } from './supabase.js'

let productos = []
let idx = 0

// ── Refs del hero ─────────────────────────────────────────
const hero        = document.getElementById('productos')
const titleEl     = hero?.querySelector('.product-title')
const descEl      = hero?.querySelector('.product-desc')
const specsEl     = hero?.querySelector('.specs')
const priceEl     = hero?.querySelector('.price')
const imgEl       = hero?.querySelector('.product-img')
const catTagEl    = hero?.querySelector('.category-tag')
const catBreadEl  = document.getElementById('hero-cat-breadcrumb')
const stockEl     = hero?.querySelector('.breadcrumb .live')
const pageNumEl   = hero?.querySelector('.pagination .current')
const pageTotEl   = hero?.querySelector('.pagination .total')
const prevBtn     = hero?.querySelector('.nav-btn:not(.next)')
const nextBtn     = hero?.querySelector('.nav-btn.next')
const btnCart     = document.getElementById('btn-add-cart')
const priceLabelEl = hero?.querySelector('.price-block')
const categoryStripEl = document.getElementById('categorias')
const brandGridEl = document.getElementById('brand-grid')

let homepageCmsChannel = null
let homepageCmsRefreshTimer = null

function html(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function safeUrl(value = '') {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^www\./i.test(url)) return `https://${url}`
  if (url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://')) return url
  return ''
}

function normalizeBrandKey(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function isInternalGlowBrand(marca = {}) {
  const keys = [
    normalizeBrandKey(marca.slug),
    normalizeBrandKey(marca.nombre),
    normalizeBrandKey(marca.name)
  ].filter(Boolean)

  return keys.some(key =>
    key === 'gb' ||
    key === 'glowbox' ||
    key === 'glowboxes' ||
    key === 'glowboxesar' ||
    key === 'glowboxesargentina' ||
    key === 'glowbxoes' ||
    (key.includes('glow') && (key.includes('box') || key.includes('bxo')))
  )
}

function shouldShowPartnerBrand(marca = {}) {
  if (!marca || isInternalGlowBrand(marca)) return false
  if (marca.is_partner === false) return false
  if (marca.homepage_visible === false || marca.visible_home === false) return false
  return marca.activo !== false
}

function sortPartnerBrands(a = {}, b = {}) {
  const priorityA = Number(a.partner_priority ?? a.homepage_order ?? a.orden ?? 9999)
  const priorityB = Number(b.partner_priority ?? b.homepage_order ?? b.orden ?? 9999)
  if (priorityA !== priorityB) return priorityA - priorityB
  return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
}

// ── Cargar productos activos ──────────────────────────────
async function loadProductos() {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*, categorias(nombre), marcas(nombre)')
      .eq('activo', true)
      .order('destacado', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!data?.length) return

    productos = data
    if (pageTotEl) pageTotEl.textContent = String(productos.length).padStart(2, '0')
    renderProducto(0)
  } catch (err) {
    console.error('[homepage] No se pudieron cargar productos.', err)
  }
}

// ── Renderizar producto en el hero ────────────────────────
function renderProducto(i) {
  if (!productos.length) return
  idx = ((i % productos.length) + productos.length) % productos.length
  const p = productos[idx]

  // Breadcrumb y category tag
  const catNombre = p.categorias?.nombre?.toUpperCase() || 'PRODUCTO'
  if (catBreadEl) catBreadEl.textContent = catNombre
  if (catTagEl) {
    const marcaNombre = p.marcas?.nombre?.toUpperCase()
    catTagEl.textContent = marcaNombre ? `${catNombre} · ${marcaNombre}` : catNombre
  }
  if (stockEl) stockEl.textContent = p.stock > 0 ? 'EN STOCK' : 'SIN STOCK'

  // Título — primera palabra en accent, resto en outline
  if (titleEl) {
    const words = (p.nombre || '').split(' ')
    const w1    = words[0] || ''
    const rest  = words.slice(1).join(' ')
    titleEl.innerHTML = rest
      ? `<span class="accent">${html(w1.toUpperCase())}</span><br><span class="outline">${html(rest.toUpperCase())}</span>`
      : `<span class="accent">${html(w1.toUpperCase())}</span>`
  }

  // Descripción
  if (descEl) descEl.textContent = p.descripcion || ''

  // Specs desde atributos JSONB — hasta 3
  if (specsEl) {
    const attrs   = p.atributos || {}
    const entries = Object.entries(attrs).slice(0, 3)
    specsEl.innerHTML = entries.map(([label, val]) => `
      <div class="spec">
        <div class="spec-label">${html(label)}</div>
        <div class="spec-value">${html(val)}</div>
      </div>`).join('')
  }

  // Precio (con oferta si existe)
  const precioFinal    = p.precio_oferta || p.precio
  const precioOriginal = p.precio_oferta ? p.precio : null
  if (priceLabelEl) {
    priceLabelEl.innerHTML = `
      <span class="price-label">${p.precio_oferta ? 'OFERTA' : 'Precio'}</span>
      <div class="price"><span class="currency">$</span>${Number(precioFinal).toLocaleString('es-AR')}</div>
      ${precioOriginal ? `<div style="font-family:'Space Mono',monospace;font-size:11px;color:var(--ink-mute);text-decoration:line-through;margin-top:2px">$${Number(precioOriginal).toLocaleString('es-AR')}</div>` : ''}`
  }

  // Imagen
  if (imgEl) {
    imgEl.style.opacity = '0'
    imgEl.src = p.imagen_url || 'img/producto1.png'
    imgEl.alt = p.nombre
    imgEl.onload = () => { imgEl.style.transition = 'opacity .3s'; imgEl.style.opacity = '1' }
    imgEl.onerror = () => { imgEl.src = 'img/producto1.png'; imgEl.style.opacity = '1' }
  }

  // Datos en el botón de carrito
  if (btnCart) {
    btnCart.dataset.id     = p.id
    btnCart.dataset.productoId = p.id
    btnCart.dataset.slug   = p.slug || ''
    btnCart.dataset.sku    = p.sku || ''
    btnCart.dataset.nombre = p.nombre
    btnCart.dataset.precio = precioFinal
    btnCart.dataset.imagen = p.imagen_url || ''
  }

  // Paginación
  if (pageNumEl) pageNumEl.textContent = String(idx + 1).padStart(2, '0')
}

function focusCategory(categoryId) {
  if (!categoryId || !productos.length) return
  const nextIndex = productos.findIndex(producto => producto.categoria_id === categoryId)
  if (nextIndex >= 0) renderProducto(nextIndex)
}

function renderCategories(categorias = []) {
  if (!categoryStripEl) return

  if (!categorias.length) {
    categoryStripEl.innerHTML = `
      <div class="cat cms-empty">
        <span class="cat-num">[00]</span>
        <span class="cat-name">Sin categorías activas</span>
      </div>`
    return
  }

  categoryStripEl.innerHTML = categorias.map((categoria, index) => `
    <a class="cat" href="#productos" data-category-id="${html(categoria.id)}" data-category-slug="${html(categoria.slug || '')}">
      <span class="cat-num">[${String(index + 1).padStart(2, '0')}]</span>
      <span class="cat-name">${html(categoria.nombre || 'Categoría')}</span>
      <svg class="cat-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
    </a>
  `).join('')

  categoryStripEl.querySelectorAll('[data-category-id]').forEach(item => {
    item.addEventListener('click', () => focusCategory(item.dataset.categoryId))
  })
}

function renderBrands(marcas = []) {
  if (!brandGridEl) return
  const partnerBrands = marcas
    .filter(shouldShowPartnerBrand)
    .sort(sortPartnerBrands)

  if (!partnerBrands.length) {
    brandGridEl.innerHTML = '<div class="brand-item cms-empty">Sin aliados activos</div>'
    return
  }

  brandGridEl.innerHTML = partnerBrands.map(marca => {
    const name = marca.nombre || 'Marca'
    const logo = safeUrl(marca.logo_url)
    const url = safeUrl(marca.website || marca.url || marca.link_url)
    const tag = url ? 'a' : 'div'
    const attrs = url ? ` href="${html(url)}" target="_blank" rel="noopener noreferrer"` : ''
    const logoMarkup = logo ? `<img class="brand-logo" src="${html(logo)}" alt="${html(name)}" loading="lazy" data-brand-logo>` : ''

    return `
      <${tag} class="brand-item${logo ? ' has-logo' : ''}"${attrs}>
        ${logoMarkup}
        <span class="brand-name">${html(name)}</span>
      </${tag}>
    `
  }).join('')

  brandGridEl.querySelectorAll('[data-brand-logo]').forEach(img => {
    img.addEventListener('error', () => {
      img.closest('.brand-item')?.classList.remove('has-logo')
      img.remove()
    }, { once: true })
  })
}

async function loadHomepageCms({ silent = false } = {}) {
  try {
    const [catRes, brandRes] = await Promise.all([
      supabase
        .from('categorias')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true }),
      supabase
        .from('marcas')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true })
    ])

    if (catRes.error) throw catRes.error
    if (brandRes.error) throw brandRes.error

    renderCategories(catRes.data || [])
    renderBrands(brandRes.data || [])
  } catch (err) {
    console.error('[homepage] No se pudo cargar contenido CMS.', err)
    if (!silent) {
      renderCategories([])
      renderBrands([])
    }
  }
}

function scheduleHomepageCmsRefresh() {
  window.clearTimeout(homepageCmsRefreshTimer)
  homepageCmsRefreshTimer = window.setTimeout(() => {
    loadHomepageCms({ silent: true })
  }, 350)
}

function subscribeHomepageCms() {
  if (homepageCmsChannel || !supabase.channel) return

  try {
    homepageCmsChannel = supabase
      .channel('homepage-cms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias' }, scheduleHomepageCmsRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marcas' }, scheduleHomepageCmsRefresh)
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[homepage] Realtime CMS no disponible; se mantiene refresco automático.')
        }
      })
  } catch (err) {
    console.warn('[homepage] No se pudo iniciar realtime CMS.', err)
  }
}

// ── Navegación ────────────────────────────────────────────
prevBtn?.addEventListener('click', () => renderProducto(idx - 1))
nextBtn?.addEventListener('click', () => renderProducto(idx + 1))

document.addEventListener('keydown', e => {
  if (document.activeElement?.tagName === 'INPUT') return
  if (e.key === 'ArrowLeft')  renderProducto(idx - 1)
  if (e.key === 'ArrowRight') renderProducto(idx + 1)
})

loadProductos()
loadHomepageCms()
subscribeHomepageCms()
window.setInterval(() => loadHomepageCms({ silent: true }), 60000)
