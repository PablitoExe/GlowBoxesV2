import { supabase } from './supabase.js'

const PRODUCT_BUCKET = 'product-images'
const BRAND_BUCKET   = 'brand-logos'
const PROOF_BUCKET   = 'comprobantes'
const PAGE_SIZE = 12
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const state = {
  categorias: [],
  marcas: [],
  productos: [],
  pedidos: [],
  pedidoItems: [],
  clientes: [],
  cupones: [],
  productsPage: 1,
  ordersPage: 1,
  productsFilters: { search: '', categoria: '', marca: '', stock: '' },
  ordersFilters: { search: '', estado: '', range: '30' },
  customersFilters: { search: '', tipo: '', estado: '' },
}

let editingProductId = null
let editingCouponId = null
let editingCatId = null
let editingBrandId = null
let editingOrderId = null
let editingCustomerId = null
let orderItemCount = 0

const fmtNumber = n => Number(n || 0).toLocaleString('es-AR')
const fmtMoney = n => `$${fmtNumber(Math.round(Number(n || 0)))}`
const fmtDate = value => value ? new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : '—'
const fmtDateTime = value => value ? new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase() : '—'
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
const daysAgo = days => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(0, 0, 0, 0); return d }

const ORDER_STATUS = {
  pendiente: { cls: 'pending', label: 'Pendiente' },
  confirmado: { cls: 'violet', label: 'Confirmado' },
  en_preparacion: { cls: 'violet', label: 'Preparación' },
  en_transito: { cls: 'shipped', label: 'En tránsito' },
  entregado: { cls: 'ok', label: 'Entregado' },
  pagado: { cls: 'ok', label: 'Pagado' },
  enviado: { cls: 'shipped', label: 'Enviado' },
  completado: { cls: 'ok', label: 'Completado' },
  cancelado: { cls: 'cancel', label: 'Cancelado' },
}

const PAYMENT_STATUS = {
  pendiente: { cls: 'pending', label: 'Pendiente' },
  acreditado: { cls: 'ok', label: 'Acreditado' },
  pagado: { cls: 'ok', label: 'Pagado' },
  rechazado: { cls: 'cancel', label: 'Rechazado' },
  reembolsado: { cls: 'cancel', label: 'Reembolsado' },
}

const CUSTOMER_TYPE = {
  particular: { cls: 'draft', label: 'Particular' },
  detailer: { cls: 'violet', label: 'Detailer' },
  taller: { cls: 'shipped', label: 'Taller' },
  wrapper: { cls: 'ok', label: 'Wrapper' },
  instalador: { cls: 'ok', label: 'Instalador' },
  revendedor: { cls: 'pending', label: 'Revendedor' },
}

const ACCOUNT_STATUS = {
  activo: { cls: 'ok', label: 'Activo' },
  inactivo: { cls: 'draft', label: 'Inactivo' },
  suspendido: { cls: 'cancel', label: 'Suspendido' },
}

function $(id) {
  return document.getElementById(id)
}

function isUuid(value) {
  return UUID_RE.test(String(value || ''))
}

function set(id, value) {
  const el = $(id)
  if (el) el.textContent = value
}

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]))
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function initLoading() {
  tableLoading('orders-tbody', 9, 'Cargando pedidos reales...')
  tableLoading('products-tbody', 8, 'Cargando catálogo real...')
  tableLoading('customers-tbody', 8, 'Cargando clientes reales...')
  tableLoading('coupons-tbody', 8, 'Cargando cupones...')
  tableLoading('cats-tbody', 4, 'Cargando categorías...')
  const brands = $('brands-grid')
  if (brands) brands.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// Cargando marcas...</div>`
}

function tableLoading(id, colspan, message) {
  const tbody = $(id)
  if (!tbody) return
  tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:40px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// ${html(message)}</td></tr>`
}

function tableEmpty(id, colspan, message) {
  const tbody = $(id)
  if (!tbody) return
  tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:40px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// ${html(message)}</td></tr>`
}

function reportError(context, error) {
  console.error(context, error)
  const msg = error?.message || 'No se pudo cargar la información.'
  if (context.includes('productos')) tableEmpty('products-tbody', 8, msg)
  if (context.includes('pedidos')) tableEmpty('orders-tbody', 9, msg)
  if (context.includes('clientes')) tableEmpty('customers-tbody', 8, msg)
  if (context.includes('cupones')) tableEmpty('coupons-tbody', 8, msg)
}

function jsString(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')
}

async function loadAll() {
  initLoading()
  await Promise.all([
    loadCatalog(),
    loadOrders(),
    loadCustomers(),
    loadCoupons(),
  ])
  renderEverything()
  bindFilters()
}

async function loadCatalog() {
  const [catRes, brandRes, prodRes] = await Promise.all([
    supabase.from('categorias').select('*').order('orden', { ascending: true }),
    supabase.from('marcas').select('*').order('nombre'),
    supabase.from('productos').select('*, categorias(nombre), marcas(nombre)').order('created_at', { ascending: false }),
  ])
  if (catRes.error) reportError('categorias', catRes.error)
  if (brandRes.error) reportError('marcas', brandRes.error)
  if (prodRes.error) reportError('productos', prodRes.error)
  state.categorias = catRes.data || []
  state.marcas = brandRes.data || []
  state.productos = prodRes.data || []
  window._productos = state.productos
}

async function loadOrders() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, pedido_items(id, producto_id, nombre_producto, sku, cantidad, precio_unitario, subtotal, productos(nombre, sku, categorias(nombre)))')
    .order('created_at', { ascending: false })
  if (error) return reportError('pedidos', error)
  state.pedidos = data || []
  state.pedidoItems = state.pedidos.flatMap(order => (order.pedido_items || []).map(item => ({ ...item, pedido: order })))
}

async function loadCustomers() {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, apellido, telefono, ciudad, tipo, role, vip, estado_cuenta, notas_admin, created_at')
    .order('created_at', { ascending: false })
  if (error) return reportError('clientes', error)
  state.clientes = data || []
}

async function loadCoupons() {
  const { data, error } = await supabase
    .from('cupones')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return reportError('cupones', error)
  state.cupones = data || []
}

function renderEverything() {
  renderOverview()
  renderOrders()
  renderProducts()
  renderCustomers()
  renderCats()
  renderBrands()
  renderCoupons()
  renderReports()
  renderSidebarBadges()
}

function completedRevenueOrders() {
  return state.pedidos.filter(o => !['cancelado', 'rechazado'].includes(o.estado) && o.pago_estado !== 'rechazado')
}

function orderClient(order) {
  const profile = order.user_id ? state.clientes.find(c => c.id === order.user_id) : null
  const name = order.cliente_nombre || [profile?.nombre, profile?.apellido].filter(Boolean).join(' ') || 'Cliente'
  const email = order.cliente_email || ''
  return { profile, name, email }
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

function renderSidebarBadges() {
  const ordersBadge = document.querySelector('.nav-item[data-view="orders"] .badge')
  if (ordersBadge) ordersBadge.textContent = state.pedidos.filter(o => ['pendiente', 'confirmado', 'en_preparacion'].includes(o.estado)).length
  const couponBadge = document.querySelector('.nav-item[data-view="coupons"] .badge')
  if (couponBadge) couponBadge.textContent = state.cupones.filter(isCouponActive).length
}

function renderOverview() {
  const now = new Date()
  const start30 = daysAgo(30)
  const prev30 = daysAgo(60)
  const orders30 = completedRevenueOrders().filter(o => new Date(o.created_at) >= start30)
  const ordersPrev = completedRevenueOrders().filter(o => {
    const d = new Date(o.created_at)
    return d >= prev30 && d < start30
  })
  const revenue30 = sum(orders30, 'total')
  const revenuePrev = sum(ordersPrev, 'total')
  const ordersToday = state.pedidos.filter(o => new Date(o.created_at) >= todayStart())
  const ordersMonth = state.pedidos.filter(o => new Date(o.created_at) >= monthStart())
  const avgTicket = orders30.length ? revenue30 / orders30.length : 0
  const conversion = state.clientes.length ? (orders30.length / state.clientes.length) * 100 : 0

  const kpis = document.querySelectorAll('[data-page="overview"] .kpi')
  setKpi(kpis[0], fmtMoney(revenue30), pctDelta(revenue30, revenuePrev), 'vs 30 días previos')
  setKpi(kpis[1], fmtNumber(orders30.length), pctDelta(orders30.length, ordersPrev.length), `${ordersToday.length} hoy · ${ordersMonth.length} mes`)
  setKpi(kpis[2], fmtMoney(avgTicket), '', 'ticket promedio real')
  setKpi(kpis[3], `${conversion.toFixed(2)}%`, '', 'pedidos/clientes registrados')

  renderSalesChart(orders30)
  renderTopProducts()
  renderRecentOrders()
}

function setKpi(card, value, delta, foot) {
  if (!card) return
  const valueEl = card.querySelector('.kpi-value')
  const footEl = card.querySelector('.kpi-foot')
  if (valueEl) valueEl.innerHTML = value.startsWith('$') ? `<span class="currency">$</span>${value.slice(1)}` : value
  if (footEl) {
    const cls = delta.startsWith('-') ? 'down' : 'up'
    footEl.innerHTML = `${delta ? `<span class="delta ${cls}">${delta}</span>` : ''}<span>${html(foot)}</span>`
  }
}

function pctDelta(current, previous) {
  if (!previous) return current ? '+100%' : '0%'
  const pct = ((current - previous) / previous) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function sum(list, field) {
  return list.reduce((acc, item) => acc + Number(item[field] || 0), 0)
}

function renderSalesChart(orders) {
  const chart = document.querySelector('[data-page="overview"] .chart-wrap')
  if (!chart) return
  const totals = Array.from({ length: 30 }, (_, i) => {
    const d = daysAgo(29 - i)
    const key = d.toISOString().slice(0, 10)
    return {
      label: d.getDate().toString().padStart(2, '0'),
      total: orders.filter(o => o.created_at?.slice(0, 10) === key).reduce((s, o) => s + Number(o.total || 0), 0),
    }
  })
  const max = Math.max(...totals.map(d => d.total), 1)
  const points = totals.map((d, i) => {
    const x = 40 + i * (720 / Math.max(totals.length - 1, 1))
    const y = 230 - (d.total / max) * 180
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' L')
  const area = `M${points} L760 260 L40 260 Z`
  const line = `M${points}`
  chart.innerHTML = `
    <div class="chart-legend">
      <span class="legend-dot">Ingresos reales</span>
      <span class="legend-dot b">Máx. ${fmtMoney(max)}</span>
    </div>
    <svg class="chart" viewBox="0 0 800 280" preserveAspectRatio="none">
      <defs><linearGradient id="grad-violet-real" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a86bff" stop-opacity=".42"/><stop offset="1" stop-color="#a86bff" stop-opacity="0"/></linearGradient></defs>
      <g stroke="rgba(255,255,255,.05)" stroke-width="1"><line x1="0" y1="50" x2="800" y2="50"/><line x1="0" y1="110" x2="800" y2="110"/><line x1="0" y1="170" x2="800" y2="170"/><line x1="0" y1="230" x2="800" y2="230"/></g>
      <g fill="#5a5a66" font-family="Space Mono, monospace" font-size="10"><text x="0" y="46">${fmtMoney(max)}</text><text x="0" y="226">$0</text></g>
      <path d="${area}" fill="url(#grad-violet-real)"/>
      <path d="${line}" stroke="#a86bff" stroke-width="2" fill="none"/>
      <g fill="#5a5a66" font-family="Space Mono, monospace" font-size="10">
        ${totals.filter((_, i) => i % 5 === 0 || i === totals.length - 1).map((d, i) => `<text x="${40 + i * 5 * (720 / 29)}" y="270">${d.label}</text>`).join('')}
      </g>
    </svg>`
}

function topProductStats(limit = 5) {
  const map = new Map()
  for (const item of state.pedidoItems) {
    const id = item.producto_id || item.nombre_producto || item.productos?.nombre
    if (!id) continue
    const current = map.get(id) || {
      id,
      nombre: item.productos?.nombre || item.nombre_producto || 'Producto',
      categoria: item.productos?.categorias?.nombre || 'Sin categoría',
      cantidad: 0,
      revenue: 0,
    }
    current.cantidad += Number(item.cantidad || 0)
    current.revenue += Number(item.subtotal || 0)
    map.set(id, current)
  }
  return [...map.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, limit)
}

function renderTopProducts() {
  const list = document.querySelector('[data-page="overview"] .top-list')
  if (!list) return
  const top = topProductStats(5)
  if (!top.length) {
    list.innerHTML = `<div style="padding:30px;text-align:center;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// Sin ventas registradas todavía</div>`
    return
  }
  list.innerHTML = top.map((item, index) => `
    <div class="top-item">
      <span class="top-rank ${index < 3 ? `t${index + 1}` : ''}">${String(index + 1).padStart(2, '0')}</span>
      <div class="top-thumb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 2 12 6 8 2"/><path d="M5 8h14l-1 14H6Z"/></svg></div>
      <div class="top-info"><div class="top-name">${html(item.nombre)}</div><div class="top-cat">${html(item.categoria)} · ${fmtMoney(item.revenue)}</div></div>
      <div class="top-stat">${fmtNumber(item.cantidad)} <span class="unit">unid</span></div>
    </div>`).join('')
}

function renderRecentOrders() {
  const tbody = document.querySelector('[data-page="overview"] table tbody')
  if (!tbody) return
  const list = state.pedidos.slice(0, 5)
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// Sin pedidos recientes</td></tr>`
    return
  }
  tbody.innerHTML = list.map(order => {
    const client = orderClient(order)
    const status = ORDER_STATUS[order.estado] || { cls: 'draft', label: order.estado || '—' }
    return `<tr>
      <td class="mono">${orderNumber(order)}</td>
      <td><div class="product-cell"><div class="product-thumb" style="background:linear-gradient(135deg,var(--violet),var(--magenta));color:#fff;font-family:'Archivo Black',sans-serif;font-size:12px">${initials(client.name)}</div><div class="product-info"><div class="name">${html(client.name)}</div><div class="sku">${html(client.profile?.tipo || client.email || 'CLIENTE')}</div></div></div></td>
      <td>${order.pedido_items?.length || 0} producto${(order.pedido_items?.length || 0) !== 1 ? 's' : ''}</td>
      <td><span class="pill ${status.cls}">${status.label}</span></td>
      <td class="right"><span class="price">${fmtMoney(order.total)}</span></td>
      <td class="right mono">${fmtDateTime(order.created_at)}</td>
    </tr>`
  }).join('')
}

function orderNumber(order) {
  return order.numero ? `#${order.numero}` : `#GB-${String(order.id || '').slice(-4).toUpperCase()}`
}

function filteredOrders() {
  const q = state.ordersFilters.search.toLowerCase()
  const from = state.ordersFilters.range === 'all' ? null : daysAgo(Number(state.ordersFilters.range || 30))
  return state.pedidos.filter(order => {
    const client = orderClient(order)
    const haystack = `${order.numero || ''} ${order.id || ''} ${client.name} ${client.email}`.toLowerCase()
    return (!q || haystack.includes(q))
      && (!state.ordersFilters.estado || order.estado === state.ordersFilters.estado)
      && (!from || new Date(order.created_at) >= from)
  })
}

function renderOrders() {
  const filtered = filteredOrders()
  const page = paginate(filtered, state.ordersPage)
  renderOrdersTable(page.items)
  renderOrdersPager(filtered.length, page.totalPages)
  updateOrderKPIs()
}

function renderOrdersTable(orders) {
  const tbody = $('orders-tbody')
  if (!tbody) return
  set('orders-count', `${orders.length ? ((state.ordersPage - 1) * PAGE_SIZE) + 1 : 0}-${Math.min(state.ordersPage * PAGE_SIZE, filteredOrders().length)} de ${filteredOrders().length} pedidos`)
  if (!orders.length) return tableEmpty('orders-tbody', 9, 'No hay pedidos con esos filtros')
  tbody.innerHTML = orders.map(order => {
    const client = orderClient(order)
    const status = ORDER_STATUS[order.estado] || { cls: 'draft', label: order.estado || '—' }
    const payment = PAYMENT_STATUS[order.pago_estado] || { cls: 'draft', label: order.pago_estado || '—' }
    return `<tr>
      <td><input type="checkbox"></td>
      <td class="mono" style="color:var(--violet-glow);font-size:12px">${orderNumber(order)}</td>
      <td><div class="product-cell"><div class="product-thumb" style="background:linear-gradient(135deg,var(--violet),var(--magenta));color:#fff;font-family:'Archivo Black',sans-serif;font-size:12px">${initials(client.name)}</div><div class="product-info"><div class="name">${html(client.name)}</div><div class="sku">${html(client.email || client.profile?.ciudad || '—')}</div></div></div></td>
      <td style="color:var(--ink-dim)">${order.pedido_items?.length || 0} item${(order.pedido_items?.length || 0) !== 1 ? 's' : ''}</td>
      <td><span class="pill ${payment.cls} pill-btn" onclick="showQuickStatus(event,'${order.id}','pago_estado','${order.pago_estado || 'pendiente'}')">${payment.label}</span></td>
      <td><span class="pill ${status.cls} pill-btn" onclick="showQuickStatus(event,'${order.id}','estado','${order.estado || 'pendiente'}')">${status.label}</span></td>
      <td class="right"><span class="price">${fmtMoney(order.total)}</span></td>
      <td class="right mono" style="font-size:11px;color:var(--ink-dim)">${fmtDateTime(order.created_at)}</td>
      <td class="right"><div class="row-actions"><button class="row-act" onclick="openEditOrderModal('${order.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg></button><button class="row-act danger" onclick="deleteOrder('${order.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></td>
    </tr>`
  }).join('')
}

function updateOrderKPIs() {
  set('kpi-ord-pendiente', state.pedidos.filter(o => o.estado === 'pendiente').length)
  set('kpi-ord-enviado', state.pedidos.filter(o => ['enviado', 'en_transito'].includes(o.estado)).length)
  set('kpi-ord-completado', state.pedidos.filter(o => ['completado', 'entregado'].includes(o.estado)).length)
  set('kpi-ord-cancelado', state.pedidos.filter(o => o.estado === 'cancelado').length)
  set('kpi-ord-total-label', `// ${state.pedidos.length} total`)
}

function renderOrdersPager(total, totalPages) {
  const foot = document.querySelector('[data-page="orders"] .table-foot .pager')
  if (!foot) return
  foot.innerHTML = pagerHtml(state.ordersPage, totalPages, 'setOrdersPage')
  const sub = document.querySelector('[data-page="orders"] .page-sub')
  if (sub) sub.textContent = `Gestión de órdenes y envíos · ${fmtNumber(total)} visibles · ${fmtNumber(state.pedidos.length)} totales`
}

function filteredProducts() {
  const q = state.productsFilters.search.toLowerCase()
  return state.productos.filter(p => {
    const haystack = `${p.nombre || ''} ${p.sku || ''} ${p.categorias?.nombre || ''} ${p.marcas?.nombre || ''}`.toLowerCase()
    const stockOk = !state.productsFilters.stock
      || (state.productsFilters.stock === 'available' && p.stock > 0)
      || (state.productsFilters.stock === 'low' && p.stock > 0 && p.stock <= (p.stock_minimo || 5))
      || (state.productsFilters.stock === 'none' && p.stock <= 0)
    return (!q || haystack.includes(q))
      && (!state.productsFilters.categoria || p.categoria_id === state.productsFilters.categoria)
      && (!state.productsFilters.marca || p.marca_id === state.productsFilters.marca)
      && stockOk
  })
}

function renderProducts() {
  const filtered = filteredProducts()
  const page = paginate(filtered, state.productsPage)
  renderProductsTable(page.items, filtered.length)
  renderProductFilters()
  renderProductsPager(filtered.length, page.totalPages)
  updateProductKPIs()
}

function renderProductsTable(products, total) {
  const tbody = $('products-tbody')
  if (!tbody) return
  if (!products.length) return tableEmpty('products-tbody', 8, 'No hay productos con esos filtros')
  tbody.innerHTML = products.map(p => {
    const min = Number(p.stock_minimo || 5)
    const stockPct = p.stock > 0 ? Math.min(100, Math.round((p.stock / Math.max(min * 2, 1)) * 100)) : 0
    const stockClass = p.stock === 0 ? 'empty' : p.stock <= min ? 'low' : ''
    const stockColor = p.stock === 0 ? 'color:var(--danger)' : p.stock <= min ? 'color:var(--warn)' : ''
    const stockLabel = p.stock === 0 ? `${p.stock} unid · SIN STOCK` : p.stock <= min ? `${p.stock} unid · BAJO` : `${p.stock} unid`
    return `<tr>
      <td><input type="checkbox"></td>
      <td><div class="product-cell"><div class="product-thumb" style="${p.imagen_url ? `background-image:url(${html(p.imagen_url)});background-size:cover;background-position:center` : ''}">${!p.imagen_url ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>' : ''}</div><div class="product-info"><div class="name">${html(p.nombre)}</div><div class="sku">SKU: ${html(p.sku || '—')}${p.destacado ? ' · DESTACADO' : ''}</div></div></div></td>
      <td>${html(p.categorias?.nombre || '—')}</td>
      <td>${html(p.marcas?.nombre || '—')}</td>
      <td><div class="stock-bar ${stockClass}"><span style="width:${stockPct}%"></span></div><div class="stock-text" ${stockColor ? `style="${stockColor}"` : ''}>${stockLabel}</div></td>
      <td class="right"><span class="price">${fmtMoney(p.precio)}</span></td>
      <td><span class="pill ${p.activo ? 'ok' : 'draft'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td class="right"><div class="row-actions"><button class="row-act" title="${p.activo ? 'Desactivar' : 'Activar'}" onclick="toggleProductStatus('${p.id}',${!p.activo})">${p.activo ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="opacity:.45"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="8" cy="12" r="3" fill="currentColor"/></svg>'}</button><button class="row-act" onclick="openProductModal('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg></button><button class="row-act danger" onclick="deleteProduct('${p.id}','${jsString(p.nombre)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></td>
    </tr>`
  }).join('')
  const foot = document.querySelector('[data-page="products"] .table-foot span')
  if (foot) foot.textContent = `Mostrando ${products.length ? ((state.productsPage - 1) * PAGE_SIZE) + 1 : 0}–${Math.min(state.productsPage * PAGE_SIZE, total)} de ${total}`
}

function renderProductFilters() {
  const filters = document.querySelectorAll('[data-page="products"] .filters .filter-select')
  if (filters[0] && filters[0].dataset.ready !== '1') {
    filters[0].innerHTML = `<option value="">Todas las categorías</option>${state.categorias.map(c => `<option value="${c.id}">${html(c.nombre)}</option>`).join('')}`
    filters[0].dataset.ready = '1'
  }
  if (filters[1] && filters[1].dataset.ready !== '1') {
    filters[1].innerHTML = `<option value="">Todas las marcas</option>${state.marcas.map(m => `<option value="${m.id}">${html(m.nombre)}</option>`).join('')}`
    filters[1].dataset.ready = '1'
  }
  if (filters[2] && filters[2].dataset.ready !== '1') {
    filters[2].innerHTML = `<option value="">Todo el stock</option><option value="available">En stock</option><option value="low">Stock bajo</option><option value="none">Sin stock</option>`
    filters[2].dataset.ready = '1'
  }
}

function updateProductKPIs() {
  const total = state.productos.length
  const inactive = state.productos.filter(p => !p.activo).length
  const lowStock = state.productos.filter(p => p.stock > 0 && p.stock <= (p.stock_minimo || 5)).length
  const noStock = state.productos.filter(p => p.stock <= 0).length
  const value = state.productos.reduce((s, p) => s + Number(p.precio || 0) * Number(p.stock || 0), 0)
  set('kpi-total-prod', fmtNumber(total))
  set('kpi-prod-note', `// ${inactive} inactivos`)
  set('kpi-low-stock', fmtNumber(lowStock))
  set('kpi-no-stock', fmtNumber(noStock))
  set('kpi-valor-inv', value >= 1000000 ? `$${(value / 1000000).toFixed(1)}M` : fmtMoney(value))
  const sub = document.querySelector('[data-page="products"] .page-sub')
  if (sub) sub.textContent = `Catálogo y stock · ${fmtNumber(state.productos.filter(p => p.activo).length)} productos activos`
}

function renderProductsPager(total, totalPages) {
  const pager = document.querySelector('[data-page="products"] .table-foot .pager')
  if (pager) pager.innerHTML = pagerHtml(state.productsPage, totalPages, 'setProductsPage')
}

function paginate(list, page) {
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  return { items: list.slice(start, start + PAGE_SIZE), totalPages }
}

function pagerHtml(page, totalPages, fnName) {
  if (totalPages <= 1) return `<button class="active">1</button>`
  const pages = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i)
  }
  const unique = [...new Set(pages)].sort((a, b) => a - b)
  let last = 0
  return `<button onclick="${fnName}(${Math.max(1, page - 1)})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>`
    + unique.map(p => {
      const gap = p - last > 1 ? '<button disabled>...</button>' : ''
      last = p
      return `${gap}<button class="${p === page ? 'active' : ''}" onclick="${fnName}(${p})">${p}</button>`
    }).join('')
    + `<button onclick="${fnName}(${Math.min(totalPages, page + 1)})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>`
}

function renderCustomers() {
  const list = filteredCustomers()
  const tbody = $('customers-tbody')
  if (!tbody) return
  set('cust-count', fmtNumber(list.length))
  updateCustomerKPIs()
  renderCustomerDistribution()
  renderCustomerCities()
  if (!list.length) return tableEmpty('customers-tbody', 8, 'No hay clientes con esos filtros')
  tbody.innerHTML = list.map(c => {
    const orders = customerOrders(c.id)
    const total = sum(orders, 'total')
    const last = orders[0]?.created_at
    const name = fullName(c)
    const type = CUSTOMER_TYPE[c.tipo] || { cls: 'draft', label: c.tipo || 'Particular' }
    const status = ACCOUNT_STATUS[c.estado_cuenta || 'activo']
    return `<tr>
      <td><input type="checkbox"></td>
      <td><div class="product-cell"><div class="product-thumb" style="${c.vip ? 'background:linear-gradient(135deg,#c8ff00,#3aff8b);color:#000' : 'background:linear-gradient(135deg,var(--violet),var(--magenta));color:#fff'};font-family:'Archivo Black',sans-serif;font-size:12px">${initials(name)}</div><div class="product-info"><div class="name">${html(name)} ${c.vip ? '<span class="pill ok" style="font-size:9px;padding:1px 6px;margin-left:4px">VIP</span>' : ''}</div><div class="sku">${html(c.ciudad || c.telefono || '—')}</div></div></div></td>
      <td><span class="pill ${type.cls}">${type.label}</span></td>
      <td class="mono" style="font-size:11px;color:var(--ink-dim)">${orders.length} pedidos</td>
      <td class="right"><span class="price">${fmtMoney(total)}</span></td>
      <td class="mono" style="font-size:11px;color:var(--ink-dim)">${fmtDate(last)}</td>
      <td><span class="pill ${status.cls}">${status.label}</span></td>
      <td class="right"><div class="row-actions"><button class="row-act" onclick="openEditCustomerModal('${c.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg></button></div></td>
    </tr>`
  }).join('')
}

function fullName(c) {
  return [c.nombre, c.apellido].filter(Boolean).join(' ').trim() || 'Sin nombre'
}

function customerOrders(id) {
  return state.pedidos.filter(o => o.user_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

function filteredCustomers() {
  const q = state.customersFilters.search.toLowerCase()
  return state.clientes.filter(c => {
    const name = fullName(c)
    const haystack = `${name} ${c.telefono || ''} ${c.ciudad || ''} ${c.tipo || ''}`.toLowerCase()
    return (!q || haystack.includes(q))
      && (!state.customersFilters.tipo || c.tipo === state.customersFilters.tipo)
      && (!state.customersFilters.estado || (state.customersFilters.estado === 'vip' ? c.vip : c.estado_cuenta === state.customersFilters.estado))
  })
}

function updateCustomerKPIs() {
  set('cust-total', fmtNumber(state.clientes.length))
  set('cust-vip-count', fmtNumber(state.clientes.filter(c => c.vip).length))
  set('cust-pro', fmtNumber(state.clientes.filter(c => ['detailer', 'taller', 'wrapper', 'instalador', 'revendedor'].includes(c.tipo)).length))
  const sub = document.querySelector('[data-page="customers"] .page-sub')
  if (sub) sub.textContent = `Base de clientes · ${fmtNumber(state.clientes.length)} registrados`
}

function renderCustomerDistribution() {
  const legend = document.querySelector('[data-page="customers"] .donut-legend')
  if (!legend) return
  const total = Math.max(state.clientes.length, 1)
  const entries = ['particular', 'detailer', 'taller', 'wrapper'].map(type => ({
    type,
    label: CUSTOMER_TYPE[type]?.label || type,
    pct: Math.round((state.clientes.filter(c => c.tipo === type).length / total) * 100),
  }))
  legend.innerHTML = entries.map((e, i) => `<div class="dl-row"><span class="dot" style="background:${['#a86bff', '#ff2bd6', '#c8ff00', '#3a8dff'][i]}"></span><span class="name">${e.label}</span><span class="val">${e.pct}%</span></div>`).join('')
}

function renderCustomerCities() {
  const card = document.querySelectorAll('[data-page="customers"] .card')[1]
  const wrap = card?.querySelector('[style*="flex-direction:column"]')
  if (!wrap) return
  const counts = new Map()
  for (const c of state.clientes) {
    const city = c.ciudad || 'Sin ciudad'
    counts.set(city, (counts.get(city) || 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = Math.max(...top.map(([, n]) => n), 1)
  wrap.innerHTML = top.map(([city, count]) => `<div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="color:var(--ink)">${html(city)}</span><span style="font-family:'Bebas Neue',sans-serif;font-size:16px">${fmtNumber(count)}</span></div><div class="stock-bar" style="width:100%"><span style="width:${Math.round((count / max) * 100)}%"></span></div></div>`).join('') || `<div style="color:var(--ink-dim);font-size:13px">// Sin ciudades registradas</div>`
}

function renderCats() {
  set('cats-meta', `// ${state.categorias.length} categorías`)
  const tbody = $('cats-tbody')
  if (!tbody) return
  if (!state.categorias.length) return tableEmpty('cats-tbody', 4, 'Sin categorías')
  tbody.innerHTML = state.categorias.map(c => {
    const count = state.productos.filter(p => p.categoria_id === c.id).length
    return `<tr><td><div class="product-cell"><div class="product-thumb" style="color:var(--violet-glow)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/></svg></div><div class="product-info"><div class="name">${html(c.nombre)}</div><div class="sku">${count} productos</div></div></div></td><td class="mono" style="font-size:12px;color:var(--ink-dim)">/${html(c.slug || '—')}</td><td style="color:var(--ink-dim)">${c.orden ?? '—'}</td><td class="right"><div class="row-actions"><button class="row-act" onclick="openCatModal('${c.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg></button><button class="row-act danger" onclick="deleteCat('${c.id}','${jsString(c.nombre)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></td></tr>`
  }).join('')
}

function renderBrands() {
  set('brands-meta', `// ${state.marcas.length} marcas`)
  const grid = $('brands-grid')
  if (!grid) return
  if (!state.marcas.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// Sin marcas</div>`
    return
  }
  grid.innerHTML = state.marcas.map(m => {
    const count = state.productos.filter(p => p.marca_id === m.id).length
    const logo = m.logo_url
      ? `<img src="${html(m.logo_url)}" style="width:32px;height:32px;object-fit:contain;border-radius:2px" alt="">`
      : `<div style="width:32px;height:32px;background:rgba(168,107,255,.15);border-radius:2px;display:grid;place-items:center;font-family:'Archivo Black',sans-serif;font-size:14px;color:var(--violet-glow)">${html((m.nombre || '?')[0].toUpperCase())}</div>`
    return `<div class="admin-hover-card brand-card" style="padding:14px;background:var(--bg-2)"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${logo}<div style="font-family:'Archivo Black',sans-serif;font-size:13px;text-transform:uppercase;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${html(m.nombre)}</div></div><div style="display:flex;align-items:center;justify-content:space-between"><div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--violet-glow);letter-spacing:.12em">${count} PROD.</div><div style="display:flex;gap:4px"><button class="row-act" onclick="openBrandModal('${m.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg></button><button class="row-act danger" onclick="deleteBrand('${m.id}','${jsString(m.nombre)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></div></div>`
  }).join('')
}

function isCouponActive(c) {
  return c.activo && (!c.fecha_fin || new Date(c.fecha_fin) >= todayStart()) && (!c.max_usos || Number(c.usos_actuales || 0) < Number(c.max_usos))
}

function renderCoupons() {
  const tbody = $('coupons-tbody')
  if (!tbody) return
  updateCouponKPIs()
  if (!state.cupones.length) return tableEmpty('coupons-tbody', 8, 'Sin cupones creados')
  tbody.innerHTML = state.cupones.map(c => {
    const active = isCouponActive(c)
    const expired = c.fecha_fin && new Date(c.fecha_fin) < todayStart()
    const label = expired ? 'Vencido' : active ? 'Activo' : 'Inactivo'
    const cls = expired ? 'cancel' : active ? 'ok' : 'draft'
    const desc = c.tipo === 'porcentaje' ? `-${Number(c.descuento || 0)}%` : fmtMoney(c.descuento)
    return `<tr ${!active ? 'style="opacity:.65"' : ''}><td><div class="product-cell"><div class="product-thumb" style="color:${active ? 'var(--acid)' : 'var(--ink-mute)'};background:${active ? 'rgba(200,255,0,.06)' : 'rgba(255,255,255,.03)'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/></svg></div><div class="product-info"><div class="name" style="font-family:'Space Mono',monospace;letter-spacing:.1em">${html(c.codigo)}</div><div class="sku">CREADO ${fmtDate(c.created_at)}</div></div></div></td><td>${html(c.descripcion || '—')}</td><td><span class="pill ${c.tipo === 'porcentaje' ? 'violet' : 'shipped'}">${c.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto Fijo'}</span></td><td><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:${active ? 'var(--acid)' : 'var(--ink-mute)'}">${desc}</span></td><td>${fmtNumber(c.usos_actuales)} / ${c.max_usos ?? '∞'}</td><td class="mono">${c.fecha_fin ? fmtDate(c.fecha_fin) : '—'}</td><td><span class="pill ${cls}">${label}</span></td><td class="right"><div class="row-actions"><button class="row-act" onclick="openCouponModal('${c.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg></button><button class="row-act danger" onclick="deleteCoupon('${c.id}','${jsString(c.codigo)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></td></tr>`
  }).join('')
}

function updateCouponKPIs() {
  set('kpi-cupones-activos', fmtNumber(state.cupones.filter(isCouponActive).length))
  set('kpi-cupones-usos', fmtNumber(sum(state.cupones, 'usos_actuales')))
  const cards = document.querySelectorAll('[data-page="coupons"] .kpi')
  const discountCard = cards[2]?.querySelector('.kpi-value')
  if (discountCard) discountCard.innerHTML = `<span class="currency">$</span>${fmtNumber(sum(completedRevenueOrders(), 'descuento'))}`
  const conv = cards[3]?.querySelector('.kpi-value')
  if (conv) conv.innerHTML = `${state.pedidos.length ? ((state.pedidos.filter(o => o.cupon_codigo).length / state.pedidos.length) * 100).toFixed(1) : '0.0'}<span class="small">%</span>`
}

function renderReports() {
  renderReportKpis()
  renderCategoryRevenueChart()
  renderHeatmap()
}

function renderReportKpis() {
  const orders = completedRevenueOrders()
  const revenue = sum(orders, 'total')
  const refunds = state.pedidos.filter(o => o.pago_estado === 'reembolsado').length
  const cards = document.querySelectorAll('[data-page="reports"] .kpi')
  if (cards[0]) cards[0].querySelector('.kpi-value').innerHTML = `<span class="currency">$</span>${revenue >= 1000000 ? `${(revenue / 1000000).toFixed(2)}M` : fmtNumber(revenue)}`
  if (cards[1]) cards[1].querySelector('.kpi-value').innerHTML = `${orders.length ? ((sum(orders, 'descuento') / Math.max(revenue, 1)) * 100).toFixed(1) : '0.0'}<span class="small">%</span>`
  if (cards[2]) cards[2].querySelector('.kpi-value').innerHTML = `<span class="currency">$</span>${fmtNumber(orders.length ? revenue / orders.length : 0)}`
  if (cards[3]) cards[3].querySelector('.kpi-value').innerHTML = `${state.pedidos.length ? ((refunds / state.pedidos.length) * 100).toFixed(1) : '0.0'}<span class="small">%</span>`
}

function renderCategoryRevenueChart() {
  const container = document.querySelector('[data-page="reports"] .grid-2 .card:first-child > div[style*="padding:22px"]')
  if (!container) return
  const map = new Map()
  for (const item of state.pedidoItems) {
    const cat = item.productos?.categorias?.nombre || 'Sin categoría'
    map.set(cat, (map.get(cat) || 0) + Number(item.subtotal || 0))
  }
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = Math.max(...rows.map(([, total]) => total), 1)
  container.innerHTML = `<svg viewBox="0 0 600 240" style="width:100%;height:240px">
    <defs><linearGradient id="bar-real-1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a86bff"/><stop offset="1" stop-color="#5b1fb8"/></linearGradient><linearGradient id="bar-real-2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff2bd6"/><stop offset="1" stop-color="#a86bff"/></linearGradient></defs>
    <g stroke="rgba(255,255,255,.05)"><line x1="40" y1="40" x2="600" y2="40"/><line x1="40" y1="100" x2="600" y2="100"/><line x1="40" y1="160" x2="600" y2="160"/></g>
    ${rows.map(([name, total], i) => {
      const h = Math.max(8, (total / max) * 160)
      const x = 80 + i * 100
      const y = 200 - h
      return `<rect x="${x}" y="${y}" width="50" height="${h}" fill="url(#bar-real-${i % 2 ? 2 : 1})"/><text x="${x + 25}" y="${Math.max(18, y - 8)}" fill="#fff" font-family="Archivo Black, sans-serif" font-size="11" text-anchor="middle">${fmtMoney(total)}</text><text x="${x + 25}" y="220" fill="#9a9aa6" font-family="Space Mono, monospace" font-size="10" text-anchor="middle">${html(name.slice(0, 8).toUpperCase())}</text>`
    }).join('')}
  </svg>`
}

function renderHeatmap() {
  const hm = $('heatmap')
  if (!hm) return
  hm.innerHTML = ''
  const hours = ['00', '04', '08', '12', '16', '20']
  const matrix = hours.map(() => Array(7).fill(0))
  for (const order of state.pedidos) {
    const d = new Date(order.created_at)
    const day = (d.getDay() + 6) % 7
    const bucket = Math.min(5, Math.floor(d.getHours() / 4))
    matrix[bucket][day] += Number(order.total || 0)
  }
  const max = Math.max(...matrix.flat(), 1)
  hours.forEach((hour, r) => {
    const lbl = document.createElement('div')
    lbl.style.cssText = 'font-family:Space Mono,monospace;font-size:9px;color:#5a5a66;display:grid;place-items:center;letter-spacing:.1em'
    lbl.textContent = hour
    hm.appendChild(lbl)
    for (let c = 0; c < 7; c++) {
      const v = matrix[r][c] / max
      const cell = document.createElement('div')
      cell.style.cssText = `aspect-ratio:1;background:rgba(168,107,255,${.08 + v * .85});border:1px solid rgba(255,255,255,.04);transition:.15s;cursor:pointer;${v > .7 ? 'box-shadow:0 0 6px rgba(168,107,255,.4)' : ''}`
      cell.title = `${hour}:00 — ${fmtMoney(matrix[r][c])}`
      hm.appendChild(cell)
    }
  })
}

function bindFilters() {
  const orderSearch = document.querySelector('[data-page="orders"] .filter-search input')
  const orderSelects = document.querySelectorAll('[data-page="orders"] .filter-select')
  orderSearch?.addEventListener('input', e => { state.ordersFilters.search = e.target.value; state.ordersPage = 1; renderOrders() })
  orderSelects[0]?.addEventListener('change', e => { state.ordersFilters.estado = e.target.value; state.ordersPage = 1; renderOrders() })
  orderSelects[1]?.addEventListener('change', e => { state.ordersFilters.range = e.target.value; state.ordersPage = 1; renderOrders() })
  if (orderSelects[0]) orderSelects[0].innerHTML = `<option value="">Todos los estados</option>${Object.entries(ORDER_STATUS).map(([v, s]) => `<option value="${v}">${s.label}</option>`).join('')}`
  if (orderSelects[1]) orderSelects[1].innerHTML = `<option value="30">Últimos 30 días</option><option value="1">Hoy</option><option value="7">Esta semana</option><option value="365">Este año</option><option value="all">Todo</option>`

  const productSearch = document.querySelector('[data-page="products"] .filter-search input')
  const productSelects = document.querySelectorAll('[data-page="products"] .filter-select')
  productSearch?.addEventListener('input', e => { state.productsFilters.search = e.target.value; state.productsPage = 1; renderProducts() })
  productSelects[0]?.addEventListener('change', e => { state.productsFilters.categoria = e.target.value; state.productsPage = 1; renderProducts() })
  productSelects[1]?.addEventListener('change', e => { state.productsFilters.marca = e.target.value; state.productsPage = 1; renderProducts() })
  productSelects[2]?.addEventListener('change', e => { state.productsFilters.stock = e.target.value; state.productsPage = 1; renderProducts() })

  $('cust-search')?.addEventListener('input', e => { state.customersFilters.search = e.target.value; renderCustomers() })
  $('cust-filter-tipo')?.addEventListener('change', e => { state.customersFilters.tipo = e.target.value; renderCustomers() })
  $('cust-filter-estado')?.addEventListener('change', e => { state.customersFilters.estado = e.target.value; renderCustomers() })
}

window.setOrdersPage = page => { state.ordersPage = page; renderOrders() }
window.setProductsPage = page => { state.productsPage = page; renderProducts() }

async function uploadPublicFile(input, bucket, folder) {
  const file = input?.files?.[0]
  if (!file) return null
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const uniqueId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
  const path = folder ? `${folder}/${Date.now()}-${uniqueId}.${ext}` : `${Date.now()}-${uniqueId}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

function extractStoragePath(publicUrl, bucket) {
  if (!publicUrl) return null
  try {
    const url = new URL(publicUrl)
    const marker = `/storage/v1/object/public/${bucket}/`
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(url.pathname.slice(idx + marker.length))
  } catch {
    return null
  }
}

// ── Toast notifications ───────────────────────────────────────
let _toastTimer = null
function toast(msg, type = 'ok', duration = 3400) {
  let box = document.getElementById('admin-toast')
  if (!box) {
    box = document.createElement('div')
    box.id = 'admin-toast'
    box.style.cssText = 'position:fixed;bottom:28px;right:28px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none'
    document.body.appendChild(box)
  }
  const el = document.createElement('div')
  const colors = { ok: '#c8ff00', error: '#ff4757', warn: '#ffa726', info: '#a86bff' }
  const color = colors[type] || colors.info
  el.style.cssText = `background:var(--bg-2,#16161f);border:1px solid ${color};color:var(--ink,#f4f4f6);padding:12px 18px 12px 14px;font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.08em;max-width:340px;border-left:3px solid ${color};box-shadow:0 4px 24px rgba(0,0,0,.5);pointer-events:auto;transition:opacity .25s;opacity:0`
  el.innerHTML = `<span style="color:${color};margin-right:8px">${type === 'error' ? '✕' : type === 'warn' ? '⚠' : '✓'}</span>${msg.replace(/</g,'&lt;')}`
  box.appendChild(el)
  requestAnimationFrame(() => { el.style.opacity = '1' })
  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 280)
  }, duration)
}
window._adminToast = toast

async function getProofSignedUrl(path, download = false) {
  if (!path) throw new Error('El pedido no tiene comprobante cargado.')
  const storage = supabase.storage.from(PROOF_BUCKET)
  const { data, error } = download
    ? await storage.createSignedUrl(path, 60 * 5, { download: true })
    : await storage.createSignedUrl(path, 60 * 5)
  if (error) throw error
  return data.signedUrl
}

async function openOrderProof(path, download = false) {
  try {
    const url = await getProofSignedUrl(path, download)
    if (download) {
      const a = document.createElement('a')
      a.href = url
      a.download = ''
      document.body.appendChild(a)
      a.click()
      a.remove()
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch (error) {
    toast('No se pudo abrir el comprobante: ' + error.message, 'error')
  }
}
window.openOrderProof = openOrderProof

function fillProductSelectors() {
  const catSel = $('prod-categoria')
  const brandSel = $('prod-marca')
  if (catSel) catSel.innerHTML = `<option value="">— Categoría —</option>${state.categorias.map(c => `<option value="${c.id}">${html(c.nombre)}</option>`).join('')}`
  if (brandSel) brandSel.innerHTML = `<option value="">— Marca —</option>${state.marcas.map(m => `<option value="${m.id}">${html(m.nombre)}</option>`).join('')}`
}

async function openProductModal(id = null) {
  editingProductId = id
  fillProductSelectors()
  const form = $('form-product')
  const preview = $('prod-img-preview')
  form?.reset()
  if (preview) {
    preview.style.backgroundImage = ''
    preview.classList.remove('has-img')
  }
  const product = id ? state.productos.find(p => p.id === id) : null
  set('modal-product-title', id ? 'Editar Producto' : 'Nuevo Producto')
  if (product) {
    $('prod-nombre').value = product.nombre || ''
    $('prod-sku').value = product.sku || ''
    $('prod-precio').value = product.precio || ''
    $('prod-oferta').value = product.precio_oferta || ''
    $('prod-stock').value = product.stock ?? ''
    $('prod-descripcion').value = product.descripcion || ''
    $('prod-activo').checked = product.activo !== false
    $('prod-destacado').checked = product.destacado === true
    $('prod-categoria').value = product.categoria_id || ''
    $('prod-marca').value = product.marca_id || ''
    if (product.imagen_url && preview) {
      preview.style.backgroundImage = `url(${product.imagen_url})`
      preview.classList.add('has-img')
    }
  } else {
    $('prod-activo').checked = true
  }
  $('modal-product')?.classList.add('open')
}
window.openProductModal = openProductModal

function closeProductModal() {
  $('modal-product')?.classList.remove('open')
  editingProductId = null
}
window.closeProductModal = closeProductModal

async function saveProduct() {
  const btn = $('btn-save-product')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }
  try {
    const nombre = $('prod-nombre').value.trim()
    if (!nombre) throw new Error('El nombre del producto es obligatorio.')
    const precio = parseFloat($('prod-precio').value)
    if (!precio || precio < 0) throw new Error('Ingresá un precio válido.')

    let imagen_url = await uploadPublicFile($('prod-imagen'), PRODUCT_BUCKET, 'productos')

    // If editing and a new image was uploaded, delete the old one from storage.
    if (editingProductId && imagen_url) {
      const old = state.productos.find(p => p.id === editingProductId)
      const oldPath = extractStoragePath(old?.imagen_url, PRODUCT_BUCKET)
      if (oldPath) await supabase.storage.from(PRODUCT_BUCKET).remove([oldPath]).catch(() => {})
    }

    const payload = {
      nombre,
      slug: slugify(nombre),
      sku: $('prod-sku').value.trim() || null,
      precio,
      precio_oferta: parseFloat($('prod-oferta').value) || null,
      stock: parseInt($('prod-stock').value) || 0,
      descripcion: $('prod-descripcion').value.trim() || null,
      activo: $('prod-activo').checked,
      destacado: $('prod-destacado').checked,
      categoria_id: $('prod-categoria').value || null,
      marca_id: $('prod-marca').value || null,
    }
    if (imagen_url) payload.imagen_url = imagen_url
    if (editingProductId) delete payload.slug

    const res = editingProductId
      ? await supabase.from('productos').update(payload).eq('id', editingProductId)
      : await supabase.from('productos').insert(payload)
    if (res.error) throw res.error
    closeProductModal()
    toast(editingProductId ? 'Producto actualizado.' : 'Producto creado.', 'ok')
    await loadCatalog()
    renderProducts(); renderCats(); renderBrands(); renderOverview(); renderReports()
  } catch (error) {
    toast('Error: ' + error.message, 'error', 5000)
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar' }
  }
}
window.saveProduct = saveProduct

async function deleteProduct(id, nombre) {
  if (!await customConfirm(`¿Eliminar el producto "${nombre}"? Esta acción no se puede deshacer.`)) return
  const product = state.productos.find(p => p.id === id)
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) return toast('Error al eliminar: ' + error.message, 'error')
  // Clean up product image from storage.
  if (product?.imagen_url) {
    const path = extractStoragePath(product.imagen_url, PRODUCT_BUCKET)
    if (path) await supabase.storage.from(PRODUCT_BUCKET).remove([path]).catch(() => {})
  }
  toast(`Producto "${nombre}" eliminado.`, 'ok')
  await loadCatalog()
  renderProducts(); renderCats(); renderBrands(); renderOverview()
}

async function toggleProductStatus(id, newActive) {
  const { error } = await supabase.from('productos').update({ activo: newActive }).eq('id', id)
  if (error) return toast('Error al cambiar estado: ' + error.message, 'error')
  toast(newActive ? 'Producto activado.' : 'Producto desactivado.', 'ok')
  await loadCatalog()
  renderProducts()
}
window.toggleProductStatus = toggleProductStatus
window.deleteProduct = deleteProduct

function previewImage(input) {
  const preview = $('prod-img-preview')
  if (input.files?.[0] && preview) {
    preview.style.backgroundImage = `url(${URL.createObjectURL(input.files[0])})`
    preview.classList.add('has-img')
  }
}
window.previewImage = previewImage

async function openCouponModal(id = null) {
  editingCouponId = id
  $('form-coupon')?.reset()
  set('modal-coupon-title', id ? 'Editar Cupón' : 'Nuevo Cupón')
  const coupon = id ? state.cupones.find(c => c.id === id) : null
  if (coupon) {
    $('coup-codigo').value = coupon.codigo || ''
    $('coup-descripcion').value = coupon.descripcion || ''
    $('coup-tipo').value = coupon.tipo || 'porcentaje'
    $('coup-descuento').value = coupon.descuento || ''
    $('coup-min').value = coupon.min_compra || ''
    $('coup-max-usos').value = coupon.max_usos || ''
    $('coup-vence').value = coupon.fecha_fin || ''
    $('coup-activo').checked = coupon.activo !== false
  } else {
    $('coup-activo').checked = true
  }
  $('modal-coupon')?.classList.add('open')
}
window.openCouponModal = openCouponModal

function closeCouponModal() {
  $('modal-coupon')?.classList.remove('open')
  editingCouponId = null
}
window.closeCouponModal = closeCouponModal

async function saveCoupon() {
  const btn = $('btn-save-coupon')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }
  const payload = {
    codigo: $('coup-codigo').value.trim().toUpperCase(),
    descripcion: $('coup-descripcion').value.trim() || null,
    tipo: $('coup-tipo').value,
    descuento: parseFloat($('coup-descuento').value) || 0,
    min_compra: parseFloat($('coup-min').value) || 0,
    max_usos: parseInt($('coup-max-usos').value) || null,
    fecha_fin: $('coup-vence').value || null,
    activo: $('coup-activo').checked,
  }
  const res = editingCouponId
    ? await supabase.from('cupones').update(payload).eq('id', editingCouponId)
    : await supabase.from('cupones').insert(payload)
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar' }
  if (res.error) { toast('Error al guardar cupón: ' + res.error.message, 'error'); return }
  toast(editingCouponId ? 'Cupón actualizado.' : 'Cupón creado.', 'ok')
  closeCouponModal()
  await loadCoupons()
  renderCoupons(); renderSidebarBadges()
}
window.saveCoupon = saveCoupon

async function deleteCoupon(id, codigo) {
  if (!await customConfirm(`¿Eliminar el cupón "${codigo}"? Esta acción no se puede deshacer.`)) return
  const { error } = await supabase.from('cupones').delete().eq('id', id)
  if (error) { toast('Error al eliminar cupón: ' + error.message, 'error'); return }
  toast('Cupón eliminado.', 'ok')
  await loadCoupons()
  renderCoupons(); renderSidebarBadges()
}
window.deleteCoupon = deleteCoupon

async function openCatModal(id = null) {
  editingCatId = id
  $('form-cat')?.reset()
  set('modal-cat-title', id ? 'Editar Categoría' : 'Nueva Categoría')
  const cat = id ? state.categorias.find(c => c.id === id) : null
  if (cat) {
    $('cat-nombre').value = cat.nombre || ''
    $('cat-slug').value = cat.slug || ''
    $('cat-descripcion').value = cat.descripcion || ''
    $('cat-orden').value = cat.orden ?? ''
    if ($('cat-activo')) $('cat-activo').checked = cat.activo !== false
  } else {
    if ($('cat-activo')) $('cat-activo').checked = true
  }
  $('modal-cat')?.classList.add('open')
}
window.openCatModal = openCatModal

function closeCatModal() {
  $('modal-cat')?.classList.remove('open')
  editingCatId = null
}
window.closeCatModal = closeCatModal

async function saveCat() {
  const btn = $('btn-save-cat')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }
  const nombre = $('cat-nombre').value.trim()
  if (!nombre) {
    toast('El nombre de la categoría es obligatorio.', 'warn')
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar' }
    return
  }
  const payload = {
    nombre,
    slug: $('cat-slug').value.trim() || slugify(nombre),
    descripcion: $('cat-descripcion').value.trim() || null,
    orden: parseInt($('cat-orden').value) || 0,
    activo: $('cat-activo') ? $('cat-activo').checked : true,
  }
  const res = editingCatId
    ? await supabase.from('categorias').update(payload).eq('id', editingCatId)
    : await supabase.from('categorias').insert(payload)
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar' }
  if (res.error) return toast('Error: ' + res.error.message, 'error', 5000)
  closeCatModal()
  toast(editingCatId ? 'Categoría actualizada.' : 'Categoría creada.', 'ok')
  await loadCatalog()
  renderProducts(); renderCats(); renderOverview(); renderReports()
}
window.saveCat = saveCat

async function deleteCat(id, nombre) {
  if (!await customConfirm(`¿Eliminar la categoría "${nombre}"? Los productos asociados quedarán sin categoría.`)) return
  const { error } = await supabase.from('categorias').delete().eq('id', id)
  if (error) return toast('Error al eliminar: ' + error.message, 'error')
  toast(`Categoría "${nombre}" eliminada.`, 'ok')
  await loadCatalog()
  renderProducts(); renderCats()
}

async function toggleCatStatus(id, newActive) {
  const { error } = await supabase.from('categorias').update({ activo: newActive }).eq('id', id)
  if (error) return toast('Error al cambiar estado: ' + error.message, 'error')
  toast(newActive ? 'Categoría activada.' : 'Categoría desactivada.', 'ok')
  await loadCatalog()
  renderCats(); renderProducts()
}
window.toggleCatStatus = toggleCatStatus
window.deleteCat = deleteCat

async function openBrandModal(id = null) {
  editingBrandId = id
  $('form-brand')?.reset()
  set('modal-brand-title', id ? 'Editar Marca' : 'Nueva Marca')
  const preview = $('brand-img-preview')
  if (preview) {
    preview.style.backgroundImage = ''
    preview.classList.remove('has-img')
  }
  const brand = id ? state.marcas.find(m => m.id === id) : null
  if (brand) {
    $('brand-nombre').value = brand.nombre || ''
    $('brand-activo').checked = brand.activo !== false
    if (brand.logo_url && preview) {
      preview.style.backgroundImage = `url(${brand.logo_url})`
      preview.classList.add('has-img')
    }
  } else {
    $('brand-activo').checked = true
  }
  $('modal-brand')?.classList.add('open')
}
window.openBrandModal = openBrandModal

function closeBrandModal() {
  $('modal-brand')?.classList.remove('open')
  editingBrandId = null
}
window.closeBrandModal = closeBrandModal

async function saveBrand() {
  const btn = $('btn-save-brand')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }
  try {
    const nombre = $('brand-nombre').value.trim()
    if (!nombre) throw new Error('El nombre de la marca es obligatorio.')

    const logo_url = await uploadPublicFile($('brand-logo'), BRAND_BUCKET, null)

    // Delete old logo from storage when replacing.
    if (editingBrandId && logo_url) {
      const old = state.marcas.find(m => m.id === editingBrandId)
      const oldPath = extractStoragePath(old?.logo_url, BRAND_BUCKET)
      if (oldPath) await supabase.storage.from(BRAND_BUCKET).remove([oldPath]).catch(() => {})
    }

    const payload = { nombre, slug: slugify(nombre), activo: $('brand-activo').checked }
    if (logo_url) payload.logo_url = logo_url
    if (editingBrandId) delete payload.slug

    const res = editingBrandId
      ? await supabase.from('marcas').update(payload).eq('id', editingBrandId)
      : await supabase.from('marcas').insert(payload)
    if (res.error) throw res.error
    closeBrandModal()
    toast(editingBrandId ? 'Marca actualizada.' : 'Marca creada.', 'ok')
    await loadCatalog()
    renderProducts(); renderBrands()
  } catch (error) {
    toast('Error: ' + error.message, 'error', 5000)
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar' }
  }
}
window.saveBrand = saveBrand

async function deleteBrand(id, nombre) {
  if (!await customConfirm(`¿Eliminar la marca "${nombre}"? Esta acción no se puede deshacer.`)) return
  const brand = state.marcas.find(m => m.id === id)
  const { error } = await supabase.from('marcas').delete().eq('id', id)
  if (error) return toast('Error al eliminar: ' + error.message, 'error')
  if (brand?.logo_url) {
    const path = extractStoragePath(brand.logo_url, BRAND_BUCKET)
    if (path) await supabase.storage.from(BRAND_BUCKET).remove([path]).catch(() => {})
  }
  toast(`Marca "${nombre}" eliminada.`, 'ok')
  await loadCatalog()
  renderProducts(); renderBrands()
}
window.deleteBrand = deleteBrand

function previewBrandLogo(input) {
  const preview = $('brand-img-preview')
  if (input.files?.[0] && preview) {
    preview.style.backgroundImage = `url(${URL.createObjectURL(input.files[0])})`
    preview.classList.add('has-img')
  }
}
window.previewBrandLogo = previewBrandLogo

function openNewOrderModal() {
  orderItemCount = 0
  $('form-new-order')?.reset()
  $('order-items-list').innerHTML = ''
  set('ord-total-display', '0')
  addOrderItem()
  $('modal-new-order')?.classList.add('open')
}
window.openNewOrderModal = openNewOrderModal

function closeNewOrderModal() {
  $('modal-new-order')?.classList.remove('open')
}
window.closeNewOrderModal = closeNewOrderModal

function addOrderItem() {
  const idx = orderItemCount++
  const row = document.createElement('div')
  row.className = 'order-item-row'
  row.id = `order-item-${idx}`
  row.innerHTML = `<select class="field-input order-item-prod" onchange="fillItemPrice(${idx})"><option value="">— Producto —</option>${state.productos.map(p => `<option value="${p.id}" data-precio="${p.precio}">${html(p.nombre)}${p.sku ? ` (${html(p.sku)})` : ''}</option>`).join('')}</select><input class="field-input order-item-qty" type="number" min="1" value="1" style="width:70px" onchange="recalcTotal()" placeholder="Cant."><input class="field-input order-item-precio" type="number" min="0" style="width:110px" onchange="recalcTotal()" placeholder="Precio"><span class="order-item-sub">$0</span><button type="button" class="row-act danger" onclick="removeOrderItem(${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`
  $('order-items-list')?.appendChild(row)
}
window.addOrderItem = addOrderItem

function fillItemPrice(idx) {
  const row = $(`order-item-${idx}`)
  const opt = row?.querySelector('.order-item-prod')?.selectedOptions?.[0]
  if (opt?.dataset?.precio) row.querySelector('.order-item-precio').value = opt.dataset.precio
  recalcTotal()
}
window.fillItemPrice = fillItemPrice

function removeOrderItem(idx) {
  $(`order-item-${idx}`)?.remove()
  recalcTotal()
}
window.removeOrderItem = removeOrderItem

function recalcTotal() {
  let total = 0
  document.querySelectorAll('.order-item-row').forEach(row => {
    const qty = parseFloat(row.querySelector('.order-item-qty').value) || 0
    const price = parseFloat(row.querySelector('.order-item-precio').value) || 0
    const sub = qty * price
    row.querySelector('.order-item-sub').textContent = fmtMoney(sub)
    total += sub
  })
  set('ord-total-display', fmtNumber(total))
}
window.recalcTotal = recalcTotal

async function saveNewOrder() {
  const btn = $('btn-save-new-order')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }
  const items = []
  let total = 0
  let hasInvalidProductId = false
  for (const row of document.querySelectorAll('.order-item-row')) {
    const prodId = row.querySelector('.order-item-prod').value
    const prod = state.productos.find(p => p.id === prodId)
    const qty = parseInt(row.querySelector('.order-item-qty').value) || 0
    const price = parseFloat(row.querySelector('.order-item-precio').value) || 0
    if (prodId && !isUuid(prodId)) {
      hasInvalidProductId = true
      console.warn('[admin] Pedido bloqueado por producto_id no UUID:', prodId)
    }
    if (!prodId || qty <= 0) continue
    total += qty * price
    items.push({ producto_id: prodId, nombre_producto: prod?.nombre || null, sku: prod?.sku || null, cantidad: qty, precio_unitario: price })
  }
  if (hasInvalidProductId) {
    if (btn) { btn.disabled = false; btn.textContent = 'Crear Pedido' }
    toast('Hay productos con ID inválido. Volvé a seleccionar los productos desde el catálogo.', 'warn')
    return
  }
  if (!items.length) {
    if (btn) { btn.disabled = false; btn.textContent = 'Crear Pedido' }
    toast('Agregá al menos un producto.', 'warn')
    return
  }
  const direccion = $('ord-direccion').value.trim()
  const { data: pedido, error } = await supabase.from('pedidos').insert({
    cliente_nombre: $('ord-cliente-nombre').value.trim(),
    cliente_email: $('ord-cliente-email').value.trim() || null,
    direccion_envio: direccion ? { texto: direccion } : null,
    estado: $('ord-estado').value,
    pago_estado: $('ord-pago-estado').value,
    pago_metodo: $('ord-pago-metodo').value,
    metodo_pago: $('ord-pago-metodo').value,
    subtotal: total,
    total,
  }).select().single()
  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = 'Crear Pedido' }
    toast('Error al crear pedido: ' + error.message, 'error')
    return
  }
  const itemRes = await supabase.from('pedido_items').insert(items.map(i => ({ ...i, pedido_id: pedido.id })))
  if (btn) { btn.disabled = false; btn.textContent = 'Crear Pedido' }
  if (itemRes.error) { toast('Pedido creado, pero hubo error en items: ' + itemRes.error.message, 'warn'); return }
  toast('Pedido creado correctamente.', 'ok')
  closeNewOrderModal()
  await loadOrders()
  renderOrders(); renderOverview(); renderReports(); renderSidebarBadges()
}
window.saveNewOrder = saveNewOrder

async function openEditOrderModal(id) {
  editingOrderId = id
  const order = state.pedidos.find(o => o.id === id)
  if (!order) { toast('Pedido no encontrado.', 'error'); return }
  const client = orderClient(order)
  set('edit-order-num', orderNumber(order))
  set('edit-order-meta', `${client.name} · ${fmtDateTime(order.created_at)}`)
  const summary = $('edit-order-summary')
  if (summary) {
    const address = typeof order.direccion_envio === 'object' && order.direccion_envio
      ? (order.direccion_envio.texto || order.direccion_envio.direccion || order.direccion_envio.calle || JSON.stringify(order.direccion_envio))
      : order.direccion_envio
    summary.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px"><span>Cliente</span><strong style="color:var(--ink);text-align:right">${html(client.name)}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:12px"><span>Email</span><strong style="color:var(--ink);text-align:right">${html(client.email || '—')}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:12px"><span>Dirección</span><strong style="color:var(--ink);text-align:right">${html(address || '—')}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:12px"><span>Subtotal</span><strong style="color:var(--ink);text-align:right">${fmtMoney(order.subtotal)}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:12px"><span>Descuento</span><strong style="color:var(--ink);text-align:right">${fmtMoney(order.descuento)}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:12px"><span>Envío</span><strong style="color:var(--ink);text-align:right">${fmtMoney(order.costo_envio)}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:12px"><span>Total</span><strong style="color:var(--acid);font-family:'Bebas Neue',sans-serif;font-size:20px;text-align:right">${fmtMoney(order.total)}</strong></div>
      <div style="border-top:1px solid var(--line);padding-top:10px;margin-top:2px;display:grid;gap:8px">
        <div style="display:flex;justify-content:space-between;gap:12px"><span>Comprobante</span><strong style="color:${order.comprobante_url ? 'var(--acid)' : 'var(--ink-mute)'};text-align:right">${html(order.comprobante_filename || 'Sin comprobante')}</strong></div>
        ${order.comprobante_url ? `<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" style="padding:8px 10px;font-size:10px" onclick="openOrderProof('${jsString(order.comprobante_url)}')">Abrir</button><button type="button" class="btn btn-ghost" style="padding:8px 10px;font-size:10px" onclick="openOrderProof('${jsString(order.comprobante_url)}',true)">Descargar</button></div>` : ''}
      </div>`
  }
  $('edit-ord-estado').value = order.estado || 'pendiente'
  $('edit-ord-pago-estado').value = order.pago_estado || 'pendiente'
  $('edit-ord-pago-metodo').value = order.pago_metodo || order.metodo_pago || 'efectivo'
  $('edit-ord-seguimiento').value = order.numero_seguimiento || order.tracking_code || ''
  $('edit-ord-notas').value = order.notas || ''
  const itemsEl = $('edit-order-items')
  if (itemsEl) {
    itemsEl.innerHTML = order.pedido_items?.length
      ? order.pedido_items.map(item => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-2);border:1px solid var(--line);border-radius:3px"><div><div style="font-size:13px;font-weight:600">${html(item.productos?.nombre || item.nombre_producto || 'Producto')}</div><div style="font-size:11px;color:var(--ink-mute);font-family:'Space Mono',monospace">${item.cantidad} × ${fmtMoney(item.precio_unitario)}</div></div><div style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--acid)">${fmtMoney(item.subtotal)}</div></div>`).join('')
      : `<div style="color:var(--ink-mute);font-family:'Space Mono',monospace;font-size:11px;padding:8px 0">// Sin items registrados</div>`
  }
  $('modal-edit-order')?.classList.add('open')
}
window.openEditOrderModal = openEditOrderModal

function closeEditOrderModal() {
  $('modal-edit-order')?.classList.remove('open')
  editingOrderId = null
}
window.closeEditOrderModal = closeEditOrderModal

async function saveOrderStatus() {
  const btn = $('btn-save-edit-order')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }
  const update = {
    estado: $('edit-ord-estado').value,
    pago_estado: $('edit-ord-pago-estado').value,
    pago_metodo: $('edit-ord-pago-metodo').value,
    metodo_pago: $('edit-ord-pago-metodo').value,
    numero_seguimiento: $('edit-ord-seguimiento').value.trim() || null,
    tracking_code: $('edit-ord-seguimiento').value.trim() || null,
    notas: $('edit-ord-notas').value.trim() || null,
  }
  const { error } = await supabase.from('pedidos').update(update).eq('id', editingOrderId)
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar' }
  if (error) { toast('Error al guardar pedido: ' + error.message, 'error'); return }
  toast('Pedido actualizado.', 'ok')
  closeEditOrderModal()
  await loadOrders()
  renderOrders(); renderOverview(); renderReports()
}
window.saveOrderStatus = saveOrderStatus

async function deleteOrder(id) {
  if (!await customConfirm('¿Eliminar este pedido? Se borrarán también sus items. Esta acción no se puede deshacer.')) return
  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) { toast('Error al eliminar pedido: ' + error.message, 'error'); return }
  toast('Pedido eliminado.', 'ok')
  await loadOrders()
  renderOrders(); renderOverview(); renderReports(); renderSidebarBadges()
}
window.deleteOrder = deleteOrder

async function deleteCurrentOrder() {
  if (editingOrderId) {
    const id = editingOrderId
    closeEditOrderModal()
    await deleteOrder(id)
  }
}
window.deleteCurrentOrder = deleteCurrentOrder

const QUICK_OPTIONS = {
  estado: Object.entries(ORDER_STATUS).map(([value, data]) => ({ value, ...data })),
  pago_estado: Object.entries(PAYMENT_STATUS).map(([value, data]) => ({ value, ...data })),
}

function showQuickStatus(event, orderId, field, currentValue) {
  event.stopPropagation()
  const popup = $('quick-status-popup')
  if (!popup) return
  popup.innerHTML = (QUICK_OPTIONS[field] || []).map(opt => `<div class="qs-option ${opt.cls}${opt.value === currentValue ? ' qs-active' : ''}" onclick="applyQuickStatus('${orderId}','${field}','${opt.value}')"><span class="qs-dot"></span>${opt.label}</div>`).join('')
  const rect = event.currentTarget.getBoundingClientRect()
  popup.style.top = `${rect.bottom + 6}px`
  popup.style.left = `${rect.left}px`
  popup.classList.add('open')
}
window.showQuickStatus = showQuickStatus

async function applyQuickStatus(orderId, field, value) {
  closeQuickStatus()
  const { error } = await supabase.from('pedidos').update({ [field]: value }).eq('id', orderId)
  if (error) { toast('Error al actualizar estado: ' + error.message, 'error'); return }
  await loadOrders()
  renderOrders(); renderOverview(); renderReports()
}
window.applyQuickStatus = applyQuickStatus

function closeQuickStatus() {
  $('quick-status-popup')?.classList.remove('open')
}
document.addEventListener('click', closeQuickStatus)

async function openEditCustomerModal(id) {
  editingCustomerId = id
  const c = state.clientes.find(item => item.id === id)
  if (!c) return
  $('cust-nombre').value = fullName(c)
  $('cust-telefono').value = c.telefono || ''
  $('cust-ciudad').value = c.ciudad || ''
  $('cust-tipo').value = c.tipo || 'particular'
  $('cust-estado').value = c.estado_cuenta || 'activo'
  $('cust-vip').checked = !!c.vip
  $('cust-notas').value = c.notas_admin || ''
  set('cust-modal-email', `${customerOrders(id).length} pedidos · ${fmtMoney(sum(customerOrders(id), 'total'))}`)
  $('modal-customer')?.classList.add('open')
}
window.openEditCustomerModal = openEditCustomerModal

function closeCustomerModal() {
  $('modal-customer')?.classList.remove('open')
  editingCustomerId = null
}
window.closeCustomerModal = closeCustomerModal

async function saveCustomer() {
  const btn = $('btn-save-customer')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }
  const parts = $('cust-nombre').value.trim().split(/\s+/)
  const updates = {
    nombre: parts.shift() || '',
    apellido: parts.join(' ') || '',
    telefono: $('cust-telefono').value.trim() || null,
    ciudad: $('cust-ciudad').value.trim() || null,
    tipo: $('cust-tipo').value,
    estado_cuenta: $('cust-estado').value,
    vip: $('cust-vip').checked,
    notas_admin: $('cust-notas').value.trim() || null,
  }
  const { error } = await supabase.from('perfiles').update(updates).eq('id', editingCustomerId)
  if (btn) { btn.disabled = false; btn.textContent = error ? 'Error' : 'Guardado' }
  if (error) { toast('Error al guardar cliente: ' + error.message, 'error'); return }
  toast('Cliente actualizado.', 'ok')
  closeCustomerModal()
  await loadCustomers()
  renderCustomers(); renderOverview()
}
window.saveCustomer = saveCustomer

window.openNewCustomerModal = function() {
  $('cust-create-nombre').value = ''
  $('cust-create-email').value = ''
  $('cust-create-pass').value = ''
  $('cust-create-tipo').value = 'particular'
  $('modal-new-customer')?.classList.add('open')
}

window.closeNewCustomerModal = function() {
  $('modal-new-customer')?.classList.remove('open')
}

window.createCustomer = async function() {
  const btn = $('btn-create-customer-submit')
  const nombre = $('cust-create-nombre').value.trim()
  const email = $('cust-create-email').value.trim()
  const password = $('cust-create-pass').value
  const tipo = $('cust-create-tipo').value
  if (!nombre || !email || !password) { toast('Completá nombre, email y contraseña.', 'warn'); return }
  if (btn) { btn.disabled = true; btn.textContent = 'Creando...' }
  const { data: { session: adminSession } } = await supabase.auth.getSession()
  const parts = nombre.split(/\s+/)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre: parts[0] || '', apellido: parts.slice(1).join(' ') } },
  })
  if (adminSession?.access_token && adminSession?.refresh_token) {
    await supabase.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token })
  }
  if (btn) { btn.disabled = false; btn.textContent = error ? 'Error' : 'Crear Cliente' }
  if (error) { toast('Error al crear cliente: ' + error.message, 'error'); return }
  if (data?.user?.id) await supabase.from('perfiles').update({ tipo }).eq('id', data.user.id)
  toast('Cliente creado. Debe confirmar su email antes de poder iniciar sesión.', 'info')
  window.closeNewCustomerModal()
  await loadCustomers()
  renderCustomers()
}

window.filterCustomers = function() {
  state.customersFilters.search = $('cust-search')?.value || ''
  state.customersFilters.tipo = $('cust-filter-tipo')?.value || ''
  state.customersFilters.estado = $('cust-filter-estado')?.value || ''
  renderCustomers()
}

function customConfirm(msg, okLabel = 'Eliminar') {
  return new Promise(resolve => {
    const overlay = $('modal-confirm')
    const msgEl = $('confirm-msg')
    const okBtn = $('confirm-ok')
    const cancelBtn = $('confirm-cancel')
    if (!overlay || !okBtn || !cancelBtn) return resolve(confirm(msg))
    msgEl.textContent = msg
    okBtn.textContent = okLabel
    overlay.classList.add('open')
    const cleanup = result => {
      overlay.classList.remove('open')
      okBtn.removeEventListener('click', onOk)
      cancelBtn.removeEventListener('click', onCancel)
      overlay.removeEventListener('click', onOverlay)
      resolve(result)
    }
    const onOk = () => cleanup(true)
    const onCancel = () => cleanup(false)
    const onOverlay = e => { if (e.target === overlay) cleanup(false) }
    okBtn.addEventListener('click', onOk)
    cancelBtn.addEventListener('click', onCancel)
    overlay.addEventListener('click', onOverlay)
  })
}

document.addEventListener('DOMContentLoaded', () => {
  $('cat-nombre')?.addEventListener('input', () => {
    if (!editingCatId) $('cat-slug').value = slugify($('cat-nombre').value)
  })
})

function subscribeRealtime() {
  supabase
    .channel('admin-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async () => {
      await loadOrders()
      renderOrders(); renderOverview(); renderReports(); renderSidebarBadges()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, async () => {
      await loadCatalog()
      renderProducts(); renderSidebarBadges()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, async () => {
      await loadCustomers()
      renderCustomers(); renderOverview()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cupones' }, async () => {
      await loadCoupons()
      renderCoupons(); renderSidebarBadges()
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') console.info('[admin] Realtime conectado.')
      if (status === 'CHANNEL_ERROR') console.warn('[admin] Realtime error — datos no se actualizarán en tiempo real.')
    })
}

loadAll()
  .then(() => subscribeRealtime())
  .catch(error => {
    console.error('admin init failed', error)
    reportError('admin', error)
  })
