import { supabase } from './supabase.js'

// ── Auth guard ────────────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession()
if (!session) { window.location.replace('login.html'); throw '' }

// Redirect to login on sign-out or session expiry
supabase.auth.onAuthStateChange((event, currentSession) => {
  if (event === 'SIGNED_OUT' || !currentSession) {
    window.location.replace('login.html')
  }
})

// ── Dashboard navigation ──────────────────────────────────
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

// ── Sign out ──────────────────────────────────────────────
document.querySelector('.danger-link')?.addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.replace('index.html')
})

// ── Helpers ───────────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString('es-AR')
const fmtMoney = n => `$${fmt(Math.round(Number(n || 0)))}`

function initials(nombre, apellido) {
  const n = (nombre || '').trim()
  const a = (apellido || '').trim()
  return ((n[0] || '') + (a[0] || '')).toUpperCase() || '?'
}

// ── Load profile ──────────────────────────────────────────
async function loadPerfil() {
  let { data: perfil, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  // Auto-create profile row if trigger didn't fire (edge case: Google OAuth signup)
  if (error && error.code === 'PGRST116') {
    const meta = session.user.user_metadata || {}
    await supabase.from('perfiles').upsert({
      id:       session.user.id,
      nombre:   meta.nombre || meta.full_name?.split(' ')[0] || '',
      apellido: meta.apellido || meta.full_name?.split(' ').slice(1).join(' ') || '',
    }, { onConflict: 'id' })
    const retry = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
    perfil = retry.data
  }

  const meta     = session.user.user_metadata || {}
  const nombre   = perfil?.nombre   || meta.nombre   || meta.full_name?.split(' ')[0]  || ''
  const apellido = perfil?.apellido || meta.apellido || meta.full_name?.split(' ').slice(1).join(' ') || ''
  const email    = session.user.email
  const tipo     = (perfil?.tipo || 'particular').toUpperCase()
  const ini      = initials(nombre, apellido)

  document.querySelectorAll('.uc-avatar, .av').forEach(el => el.textContent = ini)
  document.querySelectorAll('.uc-name').forEach(el => el.textContent = `${nombre} ${apellido}`.trim() || email)
  document.querySelectorAll('.uc-email').forEach(el => el.textContent = email)
  document.querySelectorAll('.uc-tier').forEach(el => el.textContent = `CLIENTE · ${tipo}`)
  const accentEl = document.querySelector('.page-title .accent')
  if (accentEl) accentEl.textContent = nombre || 'usuario'
  const nameEl = document.querySelector('.name')
  if (nameEl) nameEl.textContent = nombre ? `${nombre} ${(apellido[0] || '')}.`.trim() : email

  if (perfil) {
    const fields = {
      'prof-nombre':   perfil.nombre   || '',
      'prof-apellido': perfil.apellido || '',
      'prof-email':    email,
      'prof-tel':      perfil.telefono || '',
      'prof-dni':      perfil.dni      || '',
      'prof-tipo':     perfil.tipo     || 'particular',
      'prof-fecha':    perfil.fecha_nac || '',
    }
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id)
      if (el) el.value = val
    })
  }

  return { nombre, apellido, tipo }
}

// ── Save profile ──────────────────────────────────────────
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
    setTimeout(() => { btn.textContent = 'Guardar Cambios' }, 2000)
  }

  if (!error) loadPerfil()
}

// ── Load orders ───────────────────────────────────────────
async function loadPedidos() {
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('*, pedido_items(id, producto_id, nombre_producto, sku, cantidad, precio_unitario, subtotal, productos(nombre, precio, imagen_url, sku))')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })

  if (!pedidos || !pedidos.length) {
    renderEmptyPedidos()
    updateKPIs([])
    return
  }

  updateKPIs(pedidos)
  renderPedidoActivo(pedidos)
  renderHistorial(pedidos)
  renderAllPedidos(pedidos)
  updateMysteryProgress(pedidos)

  const badge = document.querySelector('.side-nav a[data-page="orders"] .badge')
  if (badge) badge.textContent = pedidos.length
}

// ── KPIs ──────────────────────────────────────────────────
function updateKPIs(pedidos) {
  const totalGastado  = pedidos.reduce((s, p) => s + Number(p.total || 0), 0)
  const totalAhorrado = pedidos.reduce((s, p) => s + Number(p.descuento || 0), 0)
  const enCamino      = pedidos.filter(p => p.estado === 'en_transito').length
  const entregados    = pedidos.filter(p => p.estado === 'entregado').length

  document.querySelectorAll('[data-kpi="count"]').forEach(el => el.textContent = pedidos.length)
  document.querySelectorAll('[data-kpi="gastado"]').forEach(el => el.innerHTML = `<span class="currency">$</span>${fmt(totalGastado)}`)
  document.querySelectorAll('[data-kpi="ahorrado"]').forEach(el => el.innerHTML = `<span class="kpi-currency-alt">$</span>${fmt(totalAhorrado)}`)
  document.querySelectorAll('[data-kpi="count-foot"]').forEach(el => el.textContent = `// ${enCamino} EN CAMINO · ${entregados} ENTREGADOS`)
}

// ── Active order tracker ──────────────────────────────────
function renderPedidoActivo(pedidos) {
  const activo = pedidos.find(p => ['pendiente','confirmado','en_preparacion','en_transito'].includes(p.estado))
  const card   = document.querySelector('.card[data-card="activo"]')
  if (!card) return

  if (!activo) { card.style.display = 'none'; return }
  card.style.display = ''

  const numEl = card.querySelector('[data-field="numero"]')
  if (numEl) numEl.textContent = `// #${activo.numero || activo.id.slice(0, 8).toUpperCase()}`

  const etaEl = card.querySelector('[data-field="eta"]')
  if (etaEl && activo.eta) {
    etaEl.textContent = new Date(activo.eta).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'short' }).toUpperCase()
  }

  const codeEl = card.querySelector('[data-field="tracking"]')
  if (codeEl) codeEl.textContent = activo.tracking_code || activo.numero_seguimiento || `GLW-${activo.numero || activo.id.slice(0, 8).toUpperCase()}`

  updateTimeline(card, activo.estado)
}

function updateTimeline(card, estado) {
  const order = ['pendiente','confirmado','en_preparacion','en_transito','entregado']
  const idx   = order.indexOf(estado)
  card.querySelectorAll('.tl-step').forEach((step, i) => {
    step.classList.remove('done','current')
    if (i < idx)       step.classList.add('done')
    else if (i === idx) step.classList.add('current')
  })
}

// ── Order list rendering ──────────────────────────────────
function renderHistorial(pedidos) {
  const el = document.querySelector('[data-list="historial"]')
  if (el) el.innerHTML = pedidos.slice(0, 3).map(p => orderRowHTML(p)).join('')
}

function renderAllPedidos(pedidos) {
  const el = document.querySelector('[data-list="all-pedidos"]')
  if (el) el.innerHTML = pedidos.map(p => orderRowHTML(p)).join('')
}

function renderEmptyPedidos() {
  const msg = `<div style="padding:40px;text-align:center;font-family:'Space Mono',monospace;font-size:11px;color:var(--ink-mute);letter-spacing:.1em">// Sin pedidos todavía — <a href="/" style="color:var(--violet-glow)">Ir a la tienda →</a></div>`
  document.querySelector('[data-list="historial"]') && (document.querySelector('[data-list="historial"]').innerHTML = msg)
  document.querySelector('[data-list="all-pedidos"]') && (document.querySelector('[data-list="all-pedidos"]').innerHTML = msg)
}

const ESTADO_PILL = {
  pendiente:      '<span class="pill pending">PENDIENTE</span>',
  confirmado:     '<span class="pill violet">CONFIRMADO</span>',
  en_preparacion: '<span class="pill violet">EN PREPARACIÓN</span>',
  en_transito:    '<span class="pill shipped">EN CAMINO</span>',
  entregado:      '<span class="pill ok">ENTREGADO</span>',
  cancelado:      '<span class="pill cancel">CANCELADO</span>',
}

const PAGO_PILL = {
  pendiente:   '<span class="pill pending">PAGO PENDIENTE</span>',
  acreditado:  '<span class="pill ok">ACREDITADO</span>',
  pagado:      '<span class="pill ok">PAGADO</span>',
  rechazado:   '<span class="pill cancel">RECHAZADO</span>',
  reembolsado: '<span class="pill cancel">REEMBOLSADO</span>',
}

function html(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function orderRowHTML(p) {
  const num    = p.numero || p.id.slice(0, 8).toUpperCase()
  const items  = p.pedido_items || []
  const nombres = items.map(i => i.productos?.nombre || i.nombre_producto).filter(Boolean).join(' · ') || '—'
  const fecha  = new Date(p.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
  const estadoPill = ESTADO_PILL[p.estado] || ''
  const pagoPill   = PAGO_PILL[p.pago_estado] || ''

  // Thumbnail from first item's product image
  const firstImg = items[0]?.productos?.imagen_url
  const thumb = firstImg
    ? `<img src="${html(firstImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:2px">`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:18px;height:18px;opacity:.4"><path d="M16 2 12 6 8 2"/><path d="M5 8h14l-1 14H6Z"/></svg>`

  return `
    <div class="order">
      <div style="width:44px;height:44px;background:var(--bg-2);border:1px solid var(--line);border-radius:3px;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center">
        ${thumb}
      </div>
      <span class="order-num">#${num.slice(0, 8)}</span>
      <div class="order-info">
        <div class="order-head">
          <span class="order-id">${items.length} producto${items.length !== 1 ? 's' : ''}</span>
          ${estadoPill}
          ${pagoPill}
        </div>
        <div class="order-products">${html(nombres)}</div>
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

  document.querySelectorAll('.mystery').forEach(myst => {
    myst.querySelectorAll('.myst-dot').forEach((dot, i) => {
      dot.classList.remove('done','current')
      if (i < ciclo)              dot.classList.add('done')
      else if (i === ciclo && ciclo < 5) dot.classList.add('current')
    })
    myst.querySelectorAll('.myst-line').forEach((line, i) => {
      line.classList.remove('done','current')
      if (i < ciclo - 1)         line.classList.add('done')
      else if (i === ciclo - 1)  line.classList.add('current')
    })
  })
}

// ── Favorites ─────────────────────────────────────────────
async function loadFavoritos() {
  const { data } = await supabase
    .from('favoritos')
    .select('*, productos(id, nombre, precio, imagen_url, categorias(nombre))')
    .eq('user_id', session.user.id)

  const container = document.querySelector('[data-list="favoritos"]')
  if (!container) return

  if (!data || !data.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;font-family:'Space Mono',monospace;font-size:11px;color:var(--ink-mute);letter-spacing:.1em">// Sin favoritos — <a href="/" style="color:var(--violet-glow)">Ir a la tienda →</a></div>`
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
          ${p.imagen_url ? `<img src="${html(p.imagen_url)}" alt="${html(p.nombre)}" style="width:100%;height:100%;object-fit:cover">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 2 12 6 8 2"/><path d="M5 8h14l-1 14H6Z"/></svg>`}
        </div>
        <div class="fav-cat">// ${html(p.categorias?.nombre || 'PRODUCTO')}</div>
        <div class="fav-name">${html(p.nombre)}</div>
        <div class="fav-price">
          <span class="val"><span class="currency">$</span>${fmt(p.precio)}</span>
          <button class="fav-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14m-7-7h14"/></svg></button>
        </div>
      </div>`
  }).join('')

  const favCountEl = document.querySelector('[data-fav="count"]')
  if (favCountEl) favCountEl.textContent = `${data.length} producto${data.length !== 1 ? 's' : ''}`
}

window.removeFav = async function (favId) {
  await supabase.from('favoritos').delete().eq('id', favId)
  loadFavoritos()
}

// ── Addresses ─────────────────────────────────────────────
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

  if (!data || !data.length) { container.innerHTML = addCard; return }

  container.innerHTML = data.map(dir => `
    <div class="addr-card ${dir.predeterminada ? 'default' : ''}">
      ${dir.predeterminada ? '<span class="tag-default">PREDETERMINADA</span>' : ''}
      <div class="addr-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
      <div class="addr-name">${html(dir.nombre)}</div>
      <div class="addr-text">${html(dir.calle)}<br>${dir.cp ? html(dir.cp) + ' · ' : ''}${html(dir.ciudad)}${dir.notas ? '<br><em>' + html(dir.notas) + '</em>' : ''}</div>
      <div class="addr-actions">
        <button class="addr-act" onclick="deleteDireccion('${dir.id}')">Eliminar</button>
        ${!dir.predeterminada ? `<button class="addr-act" onclick="setDefaultDireccion('${dir.id}')">Marcar predeterminada</button>` : ''}
      </div>
    </div>`).join('') + addCard
}

window.deleteDireccion = async function (id) {
  await supabase.from('direcciones').delete().eq('id', id)
  loadDirecciones()
}

window.setDefaultDireccion = async function (id) {
  await supabase.from('direcciones').update({ predeterminada: false }).eq('user_id', session.user.id)
  await supabase.from('direcciones').update({ predeterminada: true }).eq('id', id)
  loadDirecciones()
}

window.showAddDireccion = function () {
  const nombre = prompt('Nombre (Ej: Casa, Taller):')
  if (!nombre) return
  const calle = prompt('Calle y número:')
  if (!calle) return
  const ciudad = prompt('Ciudad:')
  if (!ciudad) return
  const cp    = prompt('Código postal (opcional):') || ''
  const notas = prompt('Notas (timbre, horario, etc. — opcional):') || ''
  supabase.from('direcciones').insert({
    user_id: session.user.id,
    nombre, calle, ciudad, cp, notas,
    predeterminada: false,
  }).then(() => loadDirecciones())
}

// ── Realtime: own orders and profile ─────────────────────
function subscribeRealtime() {
  supabase
    .channel('cliente-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos',    filter: `user_id=eq.${session.user.id}` }, () => loadPedidos())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles',   filter: `id=eq.${session.user.id}` },     () => loadPerfil())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'favoritos',  filter: `user_id=eq.${session.user.id}` }, () => loadFavoritos())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'direcciones',filter: `user_id=eq.${session.user.id}` }, () => loadDirecciones())
    .subscribe(status => {
      if (status === 'SUBSCRIBED')   console.info('[cliente] Realtime conectado.')
      if (status === 'CHANNEL_ERROR') console.warn('[cliente] Realtime no disponible — actualizaciones manuales requeridas.')
    })
}

// ── Init ──────────────────────────────────────────────────
await Promise.all([loadPerfil(), loadPedidos()])
loadFavoritos()
loadDirecciones()
subscribeRealtime()
