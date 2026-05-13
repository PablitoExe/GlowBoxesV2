import { supabase } from './supabase.js'

// ── Guard: redirigir si no hay sesión ─────────────────────
const { data: { session } } = await supabase.auth.getSession()
if (!session) { window.location.href = 'login.html'; throw '' }

// ── Navegación entre páginas del dashboard ────────────────
const navLinks = document.querySelectorAll('.side-nav a[data-page]')
const pages    = document.querySelectorAll('.page')

function navigate(pageId) {
  navLinks.forEach(n => n.classList.toggle('active', n.dataset.page === pageId))
  pages.forEach(p => p.classList.toggle('active', p.dataset.page === pageId))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
window.navigate = navigate

navLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault()
    navigate(link.dataset.page)
  })
})

// ── Cerrar sesión ─────────────────────────────────────────
document.querySelector('.danger-link')?.addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'index.html'
})

// ── Helpers ───────────────────────────────────────────────
const fmt = n => Number(n).toLocaleString('es-AR')

function initials(nombre, apellido) {
  const n = (nombre || '').trim()
  const a = (apellido || '').trim()
  return ((n[0] || '') + (a[0] || '')).toUpperCase() || '?'
}

// ── Cargar perfil del usuario ─────────────────────────────
async function loadPerfil() {
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  const nombre   = perfil?.nombre   || session.user.user_metadata?.nombre   || ''
  const apellido = perfil?.apellido || session.user.user_metadata?.apellido || ''
  const email    = session.user.email
  const tipo     = (perfil?.tipo || 'particular').toUpperCase()
  const ini      = initials(nombre, apellido)

  // Avatar e iniciales
  document.querySelectorAll('.uc-avatar, .av').forEach(el => el.textContent = ini)
  document.querySelectorAll('.uc-name').forEach(el => el.textContent = `${nombre} ${apellido}`.trim() || email)
  document.querySelectorAll('.uc-email').forEach(el => el.textContent = email)
  document.querySelectorAll('.uc-tier').forEach(el => el.textContent = `CLIENTE · ${tipo}`)
  document.querySelector('.page-title .accent') && (document.querySelector('.page-title .accent').textContent = nombre || 'usuario')
  document.querySelector('.name') && (document.querySelector('.name').textContent = nombre ? `${nombre} ${apellido[0] || ''}.`.trim() : email)

  // Formulario de perfil
  if (perfil) {
    const fields = {
      'prof-nombre':   perfil.nombre   || '',
      'prof-apellido': perfil.apellido || '',
      'prof-email':    email,
      'prof-tel':      perfil.telefono  || '',
      'prof-dni':      perfil.dni       || '',
      'prof-tipo':     perfil.tipo      || 'particular',
      'prof-fecha':    perfil.fecha_nac || '',
    }
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id)
      if (el) el.value = val
    })
  }

  return { nombre, apellido, tipo }
}

// ── Guardar perfil ────────────────────────────────────────
window.savePerfil = async function () {
  const btn = document.getElementById('btn-save-perfil')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }

  const updates = {
    nombre:    document.getElementById('prof-nombre')?.value.trim(),
    apellido:  document.getElementById('prof-apellido')?.value.trim(),
    telefono:  document.getElementById('prof-tel')?.value.trim(),
    dni:       document.getElementById('prof-dni')?.value.trim(),
    tipo:      document.getElementById('prof-tipo')?.value,
    fecha_nac: document.getElementById('prof-fecha')?.value || null,
  }

  const { error } = await supabase.from('perfiles').update(updates).eq('id', session.user.id)

  if (btn) {
    btn.disabled = false
    btn.textContent = error ? '✗ Error al guardar' : '✓ Guardado'
    setTimeout(() => btn.textContent = 'Guardar Cambios', 2000)
  }

  if (!error) loadPerfil()
}

// ── Cargar pedidos ────────────────────────────────────────
async function loadPedidos() {
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(`*, pedido_items(*)`)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })

  if (!pedidos || !pedidos.length) {
    renderEmptyPedidos()
    updateKPIs([], 0, 0)
    return
  }

  updateKPIs(pedidos)
  renderPedidoActivo(pedidos)
  renderHistorial(pedidos)
  renderAllPedidos(pedidos)
  updateMysteryProgress(pedidos)

  // Badge sidebar
  const badge = document.querySelector('.side-nav a[data-page="orders"] .badge')
  if (badge) badge.textContent = pedidos.length
}

// ── KPIs ──────────────────────────────────────────────────
function updateKPIs(pedidos) {
  const totalGastado = pedidos.reduce((s, p) => s + Number(p.total), 0)
  const totalAhorrado = pedidos.reduce((s, p) => s + Number(p.descuento || 0), 0)

  const kpiCount    = document.querySelector('[data-kpi="count"]')
  const kpiGastado  = document.querySelector('[data-kpi="gastado"]')
  const kpiAhorrado = document.querySelector('[data-kpi="ahorrado"]')
  const kpiCountFoot = document.querySelector('[data-kpi="count-foot"]')

  if (kpiCount)    kpiCount.textContent    = pedidos.length
  if (kpiGastado)  kpiGastado.innerHTML    = `<span class="currency">$</span>${fmt(totalGastado)}`
  if (kpiAhorrado) kpiAhorrado.innerHTML   = `<span class="kpi-currency-alt">$</span>${fmt(totalAhorrado)}`

  const enCamino   = pedidos.filter(p => p.estado === 'en_transito').length
  const entregados = pedidos.filter(p => p.estado === 'entregado').length
  if (kpiCountFoot) kpiCountFoot.textContent = `// ${enCamino} EN CAMINO · ${entregados} ENTREGADOS`
}

// ── Pedido activo (en_transito o confirmado) ──────────────
function renderPedidoActivo(pedidos) {
  const activo = pedidos.find(p => ['en_transito','en_preparacion','confirmado'].includes(p.estado))
  const card   = document.querySelector('.card[data-card="activo"]')
  if (!card) return

  if (!activo) {
    card.style.display = 'none'
    return
  }

  card.style.display = ''

  const numEl = card.querySelector('[data-field="numero"]')
  if (numEl) numEl.textContent = `// #${activo.numero || activo.id.slice(0,8).toUpperCase()}`

  // ETA
  const etaEl = card.querySelector('[data-field="eta"]')
  if (etaEl && activo.eta) {
    const d = new Date(activo.eta)
    etaEl.textContent = d.toLocaleDateString('es-AR', { weekday:'long', day:'2-digit', month:'short' }).toUpperCase()
  }

  // Tracking code
  const codeEl = card.querySelector('[data-field="tracking"]')
  if (codeEl) codeEl.textContent = activo.tracking_code || `GLW-${activo.numero || activo.id.slice(0,8).toUpperCase()}`

  // Timeline según estado
  updateTimeline(card, activo.estado)
}

function updateTimeline(card, estado) {
  const order = ['pendiente','confirmado','en_preparacion','en_transito','entregado']
  const idx   = order.indexOf(estado)
  const steps = card.querySelectorAll('.tl-step')
  steps.forEach((step, i) => {
    step.classList.remove('done','current')
    if (i < idx)      step.classList.add('done')
    else if (i === idx) step.classList.add('current')
  })
}

// ── Historial reciente (overview) ─────────────────────────
function renderHistorial(pedidos) {
  const container = document.querySelector('[data-list="historial"]')
  if (!container) return
  const recientes = pedidos.slice(0, 3)
  container.innerHTML = recientes.map(p => orderRowHTML(p)).join('')
}

// ── Todos los pedidos (página orders) ────────────────────
function renderAllPedidos(pedidos) {
  const container = document.querySelector('[data-list="all-pedidos"]')
  if (!container) return
  container.innerHTML = pedidos.map(p => orderRowHTML(p)).join('')
}

function renderEmptyPedidos() {
  const msg = `<div style="padding:40px;text-align:center;font-family:'Space Mono',monospace;font-size:11px;color:var(--ink-mute);letter-spacing:.1em">// Sin pedidos todavía — <a href="index.html" style="color:var(--violet-glow)">Ir a la tienda →</a></div>`
  const h = document.querySelector('[data-list="historial"]')
  const a = document.querySelector('[data-list="all-pedidos"]')
  if (h) h.innerHTML = msg
  if (a) a.innerHTML = msg
}

const estadoPill = {
  pendiente:      '<span class="pill pending">PENDIENTE</span>',
  confirmado:     '<span class="pill violet">CONFIRMADO</span>',
  en_preparacion: '<span class="pill violet">EN PREPARACIÓN</span>',
  en_transito:    '<span class="pill shipped">EN CAMINO</span>',
  entregado:      '<span class="pill ok">ENTREGADO</span>',
  cancelado:      '<span class="pill cancel">CANCELADO</span>',
}

function orderRowHTML(p) {
  const num      = p.numero || p.id.slice(0,8).toUpperCase()
  const items    = p.pedido_items || []
  const nombres  = items.map(i => i.nombre_producto).join(' · ') || '—'
  const fecha    = new Date(p.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase()
  const pill     = estadoPill[p.estado] || ''
  return `
    <div class="order">
      <span class="order-num">#${num.slice(0,8)}</span>
      <div class="order-info">
        <div class="order-head">
          <span class="order-id">${items.length} producto${items.length !== 1 ? 's' : ''}</span>
          ${pill}
        </div>
        <div class="order-products">${nombres}</div>
        <div class="order-meta">${fecha}</div>
      </div>
      <div class="order-right">
        <div class="order-total"><span class="currency">$</span>${fmt(p.total)}</div>
        <div class="order-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></div>
      </div>
    </div>`
}

// ── Mystery Box progress ──────────────────────────────────
function updateMysteryProgress(pedidos) {
  const pagados = pedidos.filter(p => p.estado !== 'cancelado').length
  const ciclo   = pagados % 5
  const pct     = Math.round((ciclo / 5) * 100)

  document.querySelectorAll('[data-myst="count"]').forEach(el => el.textContent = ciclo)
  document.querySelectorAll('[data-myst="faltan"]').forEach(el => el.textContent = 5 - ciclo)
  document.querySelectorAll('.progress-30').forEach(el => el.style.setProperty('--prog', pct + '%'))

  const badge = document.querySelector('.side-nav a[data-page="rewards"] .badge')
  if (badge) badge.textContent = `${ciclo}/5`

  // Dots del progress
  document.querySelectorAll('.myst-dot').forEach((dot, i) => {
    dot.classList.remove('done','current')
    if (i < ciclo)      dot.classList.add('done')
    else if (i === ciclo && ciclo < 5) dot.classList.add('current')
  })
  document.querySelectorAll('.myst-line').forEach((line, i) => {
    line.classList.remove('done','current')
    if (i < ciclo - 1) line.classList.add('done')
    else if (i === ciclo - 1) line.classList.add('current')
  })
}

// ── Cargar favoritos ──────────────────────────────────────
async function loadFavoritos() {
  const { data } = await supabase
    .from('favoritos')
    .select('*, productos(id, nombre, precio, imagen_url, categorias(nombre))')
    .eq('user_id', session.user.id)

  const container = document.querySelector('[data-list="favoritos"]')
  if (!container) return

  if (!data || !data.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;font-family:'Space Mono',monospace;font-size:11px;color:var(--ink-mute);letter-spacing:.1em">// Sin favoritos — <a href="index.html" style="color:var(--violet-glow)">Ir a la tienda →</a></div>`
    return
  }

  container.innerHTML = data.map(fav => {
    const p = fav.productos
    if (!p) return ''
    return `
      <div class="fav">
        <button class="fav-heart" onclick="removeFav('${fav.id}')">
          <svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" fill="currentColor"/></svg>
        </button>
        <div class="fav-img">
          ${p.imagen_url ? `<img src="${p.imagen_url}" alt="${p.nombre}" style="width:100%;height:100%;object-fit:cover">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 2 12 6 8 2"/><path d="M5 8h14l-1 14H6Z"/></svg>`}
        </div>
        <div class="fav-cat">// ${p.categorias?.nombre || 'PRODUCTO'}</div>
        <div class="fav-name">${p.nombre}</div>
        <div class="fav-price">
          <span class="val"><span class="currency">$</span>${fmt(p.precio)}</span>
          <button class="fav-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14m-7-7h14"/></svg></button>
        </div>
      </div>`
  }).join('')

  const favCountEl = document.querySelector('[data-fav="count"]')
  if (favCountEl) favCountEl.textContent = `${data.length} producto${data.length !== 1 ? 's' : ''}`
}

window.removeFav = async function(favId) {
  await supabase.from('favoritos').delete().eq('id', favId)
  loadFavoritos()
}

// ── Cargar direcciones ────────────────────────────────────
async function loadDirecciones() {
  const { data } = await supabase
    .from('direcciones')
    .select('*')
    .eq('user_id', session.user.id)
    .order('predeterminada', { ascending: false })

  const container = document.querySelector('[data-list="direcciones"]')
  if (!container) return

  const addCard = `
    <div class="addr-card add" onclick="showAddDireccion()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14m-7-7h14"/></svg>
      <span>Agregar Dirección</span>
    </div>`

  if (!data || !data.length) {
    container.innerHTML = addCard
    return
  }

  container.innerHTML = data.map(dir => `
    <div class="addr-card ${dir.predeterminada ? 'default' : ''}">
      ${dir.predeterminada ? '<span class="tag-default">PREDETERMINADA</span>' : ''}
      <div class="addr-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
      <div class="addr-name">${dir.nombre}</div>
      <div class="addr-text">${dir.calle}<br>${dir.cp ? dir.cp + ' · ' : ''}${dir.ciudad}${dir.notas ? '<br><em>' + dir.notas + '</em>' : ''}</div>
      <div class="addr-actions">
        <button class="addr-act" onclick="deleteDireccion('${dir.id}')">Eliminar</button>
        ${!dir.predeterminada ? `<button class="addr-act" onclick="setDefaultDireccion('${dir.id}')">Marcar predeterminada</button>` : ''}
      </div>
    </div>`).join('') + addCard
}

window.deleteDireccion = async function(id) {
  await supabase.from('direcciones').delete().eq('id', id)
  loadDirecciones()
}

window.setDefaultDireccion = async function(id) {
  await supabase.from('direcciones').update({ predeterminada: false }).eq('user_id', session.user.id)
  await supabase.from('direcciones').update({ predeterminada: true }).eq('id', id)
  loadDirecciones()
}

window.showAddDireccion = function() {
  const nombre = prompt('Nombre (Ej: Casa, Taller):')
  if (!nombre) return
  const calle  = prompt('Calle y número:')
  if (!calle) return
  const ciudad = prompt('Ciudad:')
  if (!ciudad) return
  const cp     = prompt('Código postal (opcional):') || ''
  const notas  = prompt('Notas (timbre, horario, etc. — opcional):') || ''

  supabase.from('direcciones').insert({
    user_id: session.user.id,
    nombre, calle, ciudad, cp, notas,
    predeterminada: false,
  }).then(() => loadDirecciones())
}

// ── Init ──────────────────────────────────────────────────
await Promise.all([loadPerfil(), loadPedidos()])
loadFavoritos()
loadDirecciones()
