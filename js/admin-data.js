import { supabase } from './supabase.js'

// ── Shared state ───────────────────────────────────────────
let categorias = []
let marcas = []
let editingProductId = null
let editingCouponId = null

// ── Init ──────────────────────────────────────────────────
async function init() {
  await Promise.all([loadCategorias(), loadMarcas()])
  await Promise.all([loadProducts(), loadCoupons(), loadCats(), loadBrands(), loadOrders()])
}

async function loadCategorias() {
  const { data } = await supabase.from('categorias').select('id, nombre').order('nombre')
  categorias = data || []
}

async function loadMarcas() {
  const { data } = await supabase.from('marcas').select('id, nombre').order('nombre')
  marcas = data || []
}

// ── Products ──────────────────────────────────────────────
async function loadProducts() {
  const { data, error } = await supabase
    .from('productos')
    .select('*, categorias(nombre), marcas(nombre)')
    .order('created_at', { ascending: false })

  if (error) { console.error(error); return }

  window._productos = data || []
  renderProducts(data || [])
  updateProductKPIs(data || [])
}

function renderProducts(products) {
  const tbody = document.getElementById('products-tbody')
  if (!tbody) return

  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// Sin productos cargados</td></tr>`
    return
  }

  tbody.innerHTML = products.map(p => {
    const stockPct   = p.stock > 0 ? Math.min(100, Math.round(p.stock / 2)) : 0
    const stockClass = p.stock === 0 ? 'empty' : p.stock < 10 ? 'low' : ''
    const stockColor = p.stock === 0 ? 'color:var(--danger)' : p.stock < 10 ? 'color:var(--warn)' : ''
    const stockLabel = p.stock === 0 ? `${p.stock} unid · SIN STOCK` : p.stock < 10 ? `${p.stock} unid · BAJO` : `${p.stock} unid`
    const precio     = `$${Number(p.precio).toLocaleString('es-AR')}`
    const catNombre  = p.categorias?.nombre || '—'
    const marcaNombre = p.marcas?.nombre || '—'
    const nameSafe   = (p.nombre || '').replace(/'/g, "\\'")

    return `<tr>
      <td><input type="checkbox"></td>
      <td>
        <div class="product-cell">
          <div class="product-thumb" style="${p.imagen_url ? `background-image:url(${p.imagen_url});background-size:cover;background-position:center` : ''}">
            ${!p.imagen_url ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>' : ''}
          </div>
          <div class="product-info">
            <div class="name">${p.nombre}</div>
            <div class="sku">SKU: ${p.sku || '—'}</div>
          </div>
        </div>
      </td>
      <td>${catNombre}</td>
      <td>${marcaNombre}</td>
      <td>
        <div class="stock-bar ${stockClass}"><span style="width:${stockPct}%"></span></div>
        <div class="stock-text" ${stockColor ? `style="${stockColor}"` : ''}>${stockLabel}</div>
      </td>
      <td class="right"><span class="price"><span class="currency">$</span>${Number(p.precio).toLocaleString('es-AR')}</span></td>
      <td><span class="pill ${p.activo ? 'ok' : 'draft'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td class="right">
        <div class="row-actions">
          <button class="row-act" onclick="openProductModal('${p.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
          </button>
          <button class="row-act danger" onclick="deleteProduct('${p.id}','${nameSafe}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`
  }).join('')
}

function updateProductKPIs(products) {
  const total    = products.length
  const inactive = products.filter(p => !p.activo).length
  const lowStock = products.filter(p => p.stock > 0 && p.stock < 10).length
  const noStock  = products.filter(p => p.stock === 0).length
  const valor    = products.reduce((s, p) => s + (Number(p.precio) * Number(p.stock)), 0)
  const valorFmt = valor >= 1000000 ? `$${(valor / 1000000).toFixed(1)}M` : `$${(valor / 1000).toFixed(0)}K`

  set('kpi-total-prod',  total)
  set('kpi-prod-note',   `// ${inactive} inactivos`)
  set('kpi-low-stock',   lowStock)
  set('kpi-no-stock',    noStock)
  set('kpi-valor-inv',   valorFmt)
}

// ── Product modal ─────────────────────────────────────────
async function openProductModal(id = null) {
  editingProductId = id

  const catSel  = document.getElementById('prod-categoria')
  const marcaSel = document.getElementById('prod-marca')
  catSel.innerHTML  = `<option value="">— Categoría —</option>` + categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')
  marcaSel.innerHTML = `<option value="">— Marca —</option>` + marcas.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')

  if (id) {
    document.getElementById('modal-product-title').textContent = 'Editar Producto'
    const { data: p } = await supabase.from('productos').select('*').eq('id', id).single()
    document.getElementById('prod-nombre').value      = p.nombre || ''
    document.getElementById('prod-sku').value         = p.sku || ''
    document.getElementById('prod-precio').value      = p.precio || ''
    document.getElementById('prod-oferta').value      = p.precio_oferta || ''
    document.getElementById('prod-stock').value       = p.stock ?? ''
    document.getElementById('prod-descripcion').value = p.descripcion || ''
    document.getElementById('prod-activo').checked    = p.activo !== false
    document.getElementById('prod-destacado').checked = p.destacado === true
    catSel.value  = p.categoria_id || ''
    marcaSel.value = p.marca_id || ''
    const preview = document.getElementById('prod-img-preview')
    if (p.imagen_url) {
      preview.style.backgroundImage = `url(${p.imagen_url})`
      preview.classList.add('has-img')
    } else {
      preview.style.backgroundImage = ''
      preview.classList.remove('has-img')
    }
  } else {
    document.getElementById('modal-product-title').textContent = 'Nuevo Producto'
    document.getElementById('form-product').reset()
    document.getElementById('prod-activo').checked = true
    const preview = document.getElementById('prod-img-preview')
    preview.style.backgroundImage = ''
    preview.classList.remove('has-img')
  }

  document.getElementById('modal-product').classList.add('open')
}
window.openProductModal = openProductModal

function closeProductModal() {
  document.getElementById('modal-product').classList.remove('open')
  editingProductId = null
}
window.closeProductModal = closeProductModal

async function saveProduct() {
  const btn = document.getElementById('btn-save-product')
  btn.disabled = true
  btn.textContent = 'Guardando...'

  let imagen_url = null
  const fileInput = document.getElementById('prod-imagen')

  if (fileInput.files[0]) {
    const file = fileInput.files[0]
    const ext  = file.name.split('.').pop()
    const path = `productos/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('glow-media').upload(path, file, { upsert: true })
    if (upErr) {
      console.warn('Imagen no subida (bucket faltante?):', upErr.message)
    } else {
      imagen_url = supabase.storage.from('glow-media').getPublicUrl(path).data.publicUrl
    }
  }

  const nombre = document.getElementById('prod-nombre').value.trim()
  const payload = {
    nombre,
    slug:         slugify(nombre) + '-' + Date.now().toString(36),
    sku:          document.getElementById('prod-sku').value.trim() || null,
    precio:       parseFloat(document.getElementById('prod-precio').value) || 0,
    precio_oferta:parseFloat(document.getElementById('prod-oferta').value) || null,
    stock:        parseInt(document.getElementById('prod-stock').value) || 0,
    descripcion:  document.getElementById('prod-descripcion').value.trim() || null,
    activo:       document.getElementById('prod-activo').checked,
    destacado:    document.getElementById('prod-destacado').checked,
    categoria_id: document.getElementById('prod-categoria').value || null,
    marca_id:     document.getElementById('prod-marca').value || null,
  }
  if (imagen_url) payload.imagen_url = imagen_url

  let savePayload = { ...payload }
  if (editingProductId) delete savePayload.slug  // no sobreescribir slug al editar

  const { error } = editingProductId
    ? await supabase.from('productos').update(savePayload).eq('id', editingProductId)
    : await supabase.from('productos').insert(payload)

  btn.disabled = false
  btn.textContent = 'Guardar'

  if (error) { alert('Error: ' + error.message); return }

  closeProductModal()
  loadProducts()
}
window.saveProduct = saveProduct

async function deleteProduct(id, nombre) {
  if (!await customConfirm(`¿Eliminar el producto "${nombre}"? Esta acción no se puede deshacer.`)) return
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadProducts()
}
window.deleteProduct = deleteProduct

function previewImage(input) {
  const preview = document.getElementById('prod-img-preview')
  if (input.files[0]) {
    preview.style.backgroundImage = `url(${URL.createObjectURL(input.files[0])})`
    preview.classList.add('has-img')
  }
}
window.previewImage = previewImage

// ── Coupons ───────────────────────────────────────────────
async function loadCoupons() {
  const { data, error } = await supabase
    .from('cupones')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) { console.error(error); return }

  renderCoupons(data || [])
  updateCouponKPIs(data || [])
}

function renderCoupons(coupons) {
  const tbody = document.getElementById('coupons-tbody')
  if (!tbody) return

  if (!coupons.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// Sin cupones creados</td></tr>`
    return
  }

  const now = new Date()

  tbody.innerHTML = coupons.map(c => {
    const expired   = c.fecha_fin && new Date(c.fecha_fin) < now
    const isActive  = c.activo && !expired
    const descLabel = c.tipo === 'porcentaje'
      ? `-${c.descuento}%`
      : `$${Number(c.descuento).toLocaleString('es-AR')}`
    const usos  = `${c.usos_actuales || 0} / ${c.max_usos ?? '∞'}`
    const vence = c.fecha_fin
      ? new Date(c.fecha_fin).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
      : '—'
    const glow  = isActive ? 'var(--acid)' : 'var(--ink-mute)'
    const pillClass = expired ? 'cancel' : !c.activo ? 'draft' : 'ok'
    const pillLabel = expired ? 'Vencido' : !c.activo ? 'Inactivo' : 'Activo'
    const creado = new Date(c.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).toUpperCase()

    return `<tr ${!isActive ? 'style="opacity:.6"' : ''}>
      <td>
        <div class="product-cell">
          <div class="product-thumb" style="color:${glow};background:${isActive ? 'rgba(200,255,0,.06)' : 'rgba(255,255,255,.03)'};border-color:${isActive ? 'rgba(200,255,0,.3)' : 'rgba(255,255,255,.1)'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
          </div>
          <div class="product-info">
            <div class="name" style="font-family:'Space Mono',monospace;letter-spacing:.1em">${c.codigo}</div>
            <div class="sku">CREADO ${creado}</div>
          </div>
        </div>
      </td>
      <td>${c.descripcion || '—'}</td>
      <td><span class="pill ${c.tipo === 'porcentaje' ? 'violet' : 'shipped'}">${c.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto Fijo'}</span></td>
      <td><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:${glow}">${descLabel}</span></td>
      <td>${usos}</td>
      <td class="mono">${vence}</td>
      <td><span class="pill ${pillClass}">${pillLabel}</span></td>
      <td class="right">
        <div class="row-actions">
          <button class="row-act" onclick="openCouponModal('${c.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
          </button>
          <button class="row-act danger" onclick="deleteCoupon('${c.id}','${c.codigo}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`
  }).join('')
}

function updateCouponKPIs(coupons) {
  const now    = new Date()
  const active = coupons.filter(c => c.activo && (!c.fecha_fin || new Date(c.fecha_fin) >= now)).length
  const usos   = coupons.reduce((s, c) => s + (c.usos_actuales || 0), 0)

  set('kpi-cupones-activos', active)
  set('kpi-cupones-usos',    usos)
}

// ── Coupon modal ──────────────────────────────────────────
async function openCouponModal(id = null) {
  editingCouponId = id
  document.getElementById('modal-coupon-title').textContent = id ? 'Editar Cupón' : 'Nuevo Cupón'

  if (id) {
    const { data: c } = await supabase.from('cupones').select('*').eq('id', id).single()
    document.getElementById('coup-codigo').value      = c.codigo || ''
    document.getElementById('coup-descripcion').value = c.descripcion || ''
    document.getElementById('coup-tipo').value        = c.tipo || 'porcentaje'
    document.getElementById('coup-descuento').value   = c.descuento || ''
    document.getElementById('coup-min').value         = c.min_compra || ''
    document.getElementById('coup-max-usos').value    = c.max_usos || ''
    document.getElementById('coup-vence').value       = c.fecha_fin ? c.fecha_fin.split('T')[0] : ''
    document.getElementById('coup-activo').checked    = c.activo !== false
  } else {
    document.getElementById('form-coupon').reset()
    document.getElementById('coup-activo').checked = true
  }

  document.getElementById('modal-coupon').classList.add('open')
}
window.openCouponModal = openCouponModal

function closeCouponModal() {
  document.getElementById('modal-coupon').classList.remove('open')
  editingCouponId = null
}
window.closeCouponModal = closeCouponModal

async function saveCoupon() {
  const btn = document.getElementById('btn-save-coupon')
  btn.disabled = true
  btn.textContent = 'Guardando...'

  const payload = {
    codigo:      document.getElementById('coup-codigo').value.trim().toUpperCase(),
    descripcion: document.getElementById('coup-descripcion').value.trim() || null,
    tipo:        document.getElementById('coup-tipo').value,
    descuento:   parseFloat(document.getElementById('coup-descuento').value) || 0,
    min_compra:  parseFloat(document.getElementById('coup-min').value) || null,
    max_usos:    parseInt(document.getElementById('coup-max-usos').value) || null,
    fecha_fin:   document.getElementById('coup-vence').value || null,
    activo:      document.getElementById('coup-activo').checked,
  }

  const { error } = editingCouponId
    ? await supabase.from('cupones').update(payload).eq('id', editingCouponId)
    : await supabase.from('cupones').insert(payload)

  btn.disabled = false
  btn.textContent = 'Guardar'

  if (error) { alert('Error: ' + error.message); return }

  closeCouponModal()
  loadCoupons()
}
window.saveCoupon = saveCoupon

async function deleteCoupon(id, codigo) {
  if (!await customConfirm(`¿Eliminar el cupón "${codigo}"? Esta acción no se puede deshacer.`)) return
  const { error } = await supabase.from('cupones').delete().eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadCoupons()
}
window.deleteCoupon = deleteCoupon

// ── Categories ────────────────────────────────────────────
let editingCatId = null

async function loadCats() {
  const { data, error } = await supabase
    .from('categorias')
    .select('*, productos(count)')
    .order('orden', { ascending: true })

  if (error) { console.error(error); return }

  const list = data || []
  set('cats-meta', `// ${list.length} categorías`)

  const tbody = document.getElementById('cats-tbody')
  if (!tbody) return

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// Sin categorías</td></tr>`
    return
  }

  tbody.innerHTML = list.map(c => {
    const count = c.productos?.[0]?.count ?? 0
    const nameSafe = (c.nombre || '').replace(/'/g, "\\'")
    return `<tr>
      <td>
        <div class="product-cell">
          <div class="product-thumb" style="color:var(--violet-glow)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          </div>
          <div class="product-info">
            <div class="name">${c.nombre}</div>
            <div class="sku">${count} productos</div>
          </div>
        </div>
      </td>
      <td class="mono" style="font-size:12px;color:var(--ink-dim)">/${c.slug || '—'}</td>
      <td style="color:var(--ink-dim)">${c.orden ?? '—'}</td>
      <td class="right">
        <div class="row-actions">
          <button class="row-act" onclick="openCatModal('${c.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
          </button>
          <button class="row-act danger" onclick="deleteCat('${c.id}','${nameSafe}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`
  }).join('')

  categorias = list.map(c => ({ id: c.id, nombre: c.nombre }))
}

async function openCatModal(id = null) {
  editingCatId = id
  document.getElementById('modal-cat-title').textContent = id ? 'Editar Categoría' : 'Nueva Categoría'

  if (id) {
    const { data: c } = await supabase.from('categorias').select('*').eq('id', id).single()
    document.getElementById('cat-nombre').value      = c.nombre || ''
    document.getElementById('cat-slug').value        = c.slug || ''
    document.getElementById('cat-descripcion').value = c.descripcion || ''
    document.getElementById('cat-orden').value       = c.orden ?? ''
  } else {
    document.getElementById('form-cat').reset()
  }

  document.getElementById('modal-cat').classList.add('open')
}
window.openCatModal = openCatModal

function closeCatModal() {
  document.getElementById('modal-cat').classList.remove('open')
  editingCatId = null
}
window.closeCatModal = closeCatModal

async function saveCat() {
  const btn = document.getElementById('btn-save-cat')
  btn.disabled = true
  btn.textContent = 'Guardando...'

  const nombre = document.getElementById('cat-nombre').value.trim()
  const payload = {
    nombre,
    slug:        document.getElementById('cat-slug').value.trim() || slugify(nombre),
    descripcion: document.getElementById('cat-descripcion').value.trim() || null,
    orden:       parseInt(document.getElementById('cat-orden').value) || null,
  }

  const { error } = editingCatId
    ? await supabase.from('categorias').update(payload).eq('id', editingCatId)
    : await supabase.from('categorias').insert(payload)

  btn.disabled = false
  btn.textContent = 'Guardar'

  if (error) { alert('Error: ' + error.message); return }
  closeCatModal()
  loadCats()
}
window.saveCat = saveCat

async function deleteCat(id, nombre) {
  if (!await customConfirm(`¿Eliminar la categoría "${nombre}"? Los productos asociados quedarán sin categoría.`)) return
  const { error } = await supabase.from('categorias').delete().eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadCats()
}
window.deleteCat = deleteCat

// auto-slug when typing nombre
document.addEventListener('DOMContentLoaded', () => {
  const catNombre = document.getElementById('cat-nombre')
  const catSlug   = document.getElementById('cat-slug')
  if (catNombre && catSlug) {
    catNombre.addEventListener('input', () => {
      if (!editingCatId) catSlug.value = slugify(catNombre.value)
    })
  }
})

// ── Brands ────────────────────────────────────────────────
let editingBrandId = null

async function loadBrands() {
  const { data, error } = await supabase
    .from('marcas')
    .select('*, productos(count)')
    .order('nombre')

  if (error) { console.error(error); return }

  const list = data || []
  set('brands-meta', `// ${list.length} marcas`)

  const grid = document.getElementById('brands-grid')
  if (!grid) return

  if (!list.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// Sin marcas</div>`
    return
  }

  grid.innerHTML = list.map(m => {
    const count = m.productos?.[0]?.count ?? 0
    const initial = (m.nombre || '?')[0].toUpperCase()
    const logo = m.logo_url
      ? `<img src="${m.logo_url}" style="width:32px;height:32px;object-fit:contain;border-radius:2px" alt="">`
      : `<div style="width:32px;height:32px;background:rgba(168,107,255,.15);border-radius:2px;display:grid;place-items:center;font-family:'Archivo Black',sans-serif;font-size:14px;color:var(--violet-glow)">${initial}</div>`

    return `<div class="admin-hover-card brand-card" style="padding:14px;background:var(--bg-2)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        ${logo}
        <div style="font-family:'Archivo Black',sans-serif;font-size:13px;text-transform:uppercase;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.nombre}</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--violet-glow);letter-spacing:.12em">${count} PROD.</div>
        <div style="display:flex;gap:4px">
          <button class="row-act" onclick="openBrandModal('${m.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
          </button>
          <button class="row-act danger" onclick="deleteBrand('${m.id}','${(m.nombre||'').replace(/'/g,"\\'")}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>`
  }).join('')

  marcas = list.map(m => ({ id: m.id, nombre: m.nombre }))
}

async function openBrandModal(id = null) {
  editingBrandId = id
  document.getElementById('modal-brand-title').textContent = id ? 'Editar Marca' : 'Nueva Marca'

  const preview = document.getElementById('brand-img-preview')
  preview.style.backgroundImage = ''
  preview.classList.remove('has-img')

  if (id) {
    const { data: m } = await supabase.from('marcas').select('*').eq('id', id).single()
    document.getElementById('brand-nombre').value = m.nombre || ''
    document.getElementById('brand-activo').checked = m.activo !== false
    if (m.logo_url) {
      preview.style.backgroundImage = `url(${m.logo_url})`
      preview.classList.add('has-img')
    }
  } else {
    document.getElementById('form-brand').reset()
    document.getElementById('brand-activo').checked = true
  }

  document.getElementById('modal-brand').classList.add('open')
}
window.openBrandModal = openBrandModal

function closeBrandModal() {
  document.getElementById('modal-brand').classList.remove('open')
  editingBrandId = null
}
window.closeBrandModal = closeBrandModal

async function saveBrand() {
  const btn = document.getElementById('btn-save-brand')
  btn.disabled = true
  btn.textContent = 'Guardando...'

  let logo_url = null
  const fileInput = document.getElementById('brand-logo')
  if (fileInput.files[0]) {
    const file = fileInput.files[0]
    const ext  = file.name.split('.').pop()
    const path = `marcas/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('glow-media').upload(path, file, { upsert: true })
    if (upErr) {
      console.warn('Logo no subido (bucket faltante?):', upErr.message)
    } else {
      logo_url = supabase.storage.from('glow-media').getPublicUrl(path).data.publicUrl
    }
  }

  const payload = {
    nombre: document.getElementById('brand-nombre').value.trim(),
    activo: document.getElementById('brand-activo').checked,
  }
  if (logo_url) payload.logo_url = logo_url

  const { error } = editingBrandId
    ? await supabase.from('marcas').update(payload).eq('id', editingBrandId)
    : await supabase.from('marcas').insert(payload)

  btn.disabled = false
  btn.textContent = 'Guardar'

  if (error) { alert('Error: ' + error.message); return }
  closeBrandModal()
  loadBrands()
}
window.saveBrand = saveBrand

async function deleteBrand(id, nombre) {
  if (!await customConfirm(`¿Eliminar la marca "${nombre}"? Esta acción no se puede deshacer.`)) return
  const { error } = await supabase.from('marcas').delete().eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadBrands()
}
window.deleteBrand = deleteBrand

function previewBrandLogo(input) {
  const preview = document.getElementById('brand-img-preview')
  if (input.files[0]) {
    preview.style.backgroundImage = `url(${URL.createObjectURL(input.files[0])})`
    preview.classList.add('has-img')
  }
}
window.previewBrandLogo = previewBrandLogo

// ── Orders ────────────────────────────────────────────────
let editingOrderId = null
let orderItemCount = 0

const ESTADO_PILL = {
  pendiente:  { cls: 'pending',  label: 'Pendiente'  },
  pagado:     { cls: 'ok',       label: 'Pagado'     },
  enviado:    { cls: 'shipped',  label: 'Enviado'    },
  completado: { cls: 'ok',       label: 'Completado' },
  cancelado:  { cls: 'cancel',   label: 'Cancelado'  },
}
const PAGO_PILL = {
  pendiente:   { cls: 'pending', label: 'Pendiente'   },
  pagado:      { cls: 'ok',      label: 'Pagado'      },
  reembolsado: { cls: 'cancel',  label: 'Reembolsado' },
}
const METODO_LABEL = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  mercado_pago:  'Mercado Pago',
  tarjeta:       'Tarjeta',
  otro:          'Otro',
}

async function loadOrders() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, pedido_items(id, cantidad, precio_unitario, subtotal, productos(nombre))')
    .order('created_at', { ascending: false })

  if (error) { console.error(error); return }

  const list = data || []
  renderOrders(list)
  updateOrderKPIs(list)
}

function clienteNombre(o) {
  return o.cliente_nombre || o.perfiles?.nombre || 'Cliente'
}
function clienteEmail(o) {
  return o.cliente_email || o.perfiles?.email || ''
}

function renderOrders(orders) {
  const tbody = document.getElementById('orders-tbody')
  if (!tbody) return

  set('orders-count', `${orders.length} pedidos`)

  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--ink-dim);font-family:'Space Mono',monospace;font-size:12px">// Sin pedidos cargados</td></tr>`
    return
  }

  tbody.innerHTML = orders.map(o => {
    const nombre   = clienteNombre(o)
    const email    = clienteEmail(o)
    const initials = nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    const items    = o.pedido_items?.length ?? 0
    const estado   = ESTADO_PILL[o.estado]  || { cls: 'draft', label: o.estado }
    const pago     = PAGO_PILL[o.pago_estado] || { cls: 'draft', label: o.pago_estado }
    const total    = `$${Number(o.total || 0).toLocaleString('es-AR')}`
    const fecha    = new Date(o.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).toUpperCase()
    const num      = `#GB-${String(o.id).slice(-4).toUpperCase()}`

    return `<tr>
      <td><input type="checkbox"></td>
      <td class="mono" style="color:var(--violet-glow);font-size:12px">${num}</td>
      <td>
        <div class="product-cell">
          <div class="product-thumb" style="background:linear-gradient(135deg,var(--violet),var(--magenta));color:#fff;font-family:'Archivo Black',sans-serif;font-size:12px">${initials}</div>
          <div class="product-info">
            <div class="name">${nombre}</div>
            <div class="sku">${email}</div>
          </div>
        </div>
      </td>
      <td style="color:var(--ink-dim)">${items} item${items !== 1 ? 's' : ''}</td>
      <td><span class="pill ${pago.cls} pill-btn" onclick="showQuickStatus(event,'${o.id}','pago_estado','${o.pago_estado}')">${pago.label}</span></td>
      <td><span class="pill ${estado.cls} pill-btn" onclick="showQuickStatus(event,'${o.id}','estado','${o.estado}')">${estado.label}</span></td>
      <td class="right"><span class="price">${total}</span></td>
      <td class="right mono" style="font-size:11px;color:var(--ink-dim)">${fecha}</td>
      <td class="right">
        <div class="row-actions">
          <button class="row-act" onclick="openEditOrderModal('${o.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
          </button>
          <button class="row-act danger" onclick="deleteOrder('${o.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`
  }).join('')
}

function updateOrderKPIs(orders) {
  set('kpi-ord-pendiente',  orders.filter(o => o.estado === 'pendiente').length)
  set('kpi-ord-enviado',    orders.filter(o => o.estado === 'enviado').length)
  set('kpi-ord-completado', orders.filter(o => o.estado === 'completado').length)
  set('kpi-ord-cancelado',  orders.filter(o => o.estado === 'cancelado').length)
  set('kpi-ord-total-label', `// ${orders.length} total`)
}

// ── Nuevo pedido ──────────────────────────────────────────
function openNewOrderModal() {
  orderItemCount = 0
  document.getElementById('form-new-order').reset()
  document.getElementById('order-items-list').innerHTML = ''
  document.getElementById('ord-total-display').textContent = '0'
  addOrderItem()
  document.getElementById('modal-new-order').classList.add('open')
}
window.openNewOrderModal = openNewOrderModal

function closeNewOrderModal() {
  document.getElementById('modal-new-order').classList.remove('open')
}
window.closeNewOrderModal = closeNewOrderModal

function addOrderItem() {
  const idx  = orderItemCount++
  const list = document.getElementById('order-items-list')
  const row  = document.createElement('div')
  row.className = 'order-item-row'
  row.id = `order-item-${idx}`
  row.innerHTML = `
    <select class="field-input order-item-prod" onchange="fillItemPrice(${idx})">
      <option value="">— Producto —</option>
      ${(window._productos || []).map(p => `<option value="${p.id}" data-precio="${p.precio}">${p.nombre}${p.sku ? ` (${p.sku})` : ''}</option>`).join('')}
    </select>
    <input class="field-input order-item-qty" type="number" min="1" value="1" style="width:70px" onchange="recalcTotal()" placeholder="Cant.">
    <input class="field-input order-item-precio" type="number" min="0" style="width:110px" onchange="recalcTotal()" placeholder="Precio">
    <span class="order-item-sub">$0</span>
    <button type="button" class="row-act danger" onclick="removeOrderItem(${idx})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`
  list.appendChild(row)
}
window.addOrderItem = addOrderItem

function fillItemPrice(idx) {
  const row  = document.getElementById(`order-item-${idx}`)
  const sel  = row.querySelector('.order-item-prod')
  const opt  = sel.selectedOptions[0]
  const precio = opt?.dataset?.precio
  if (precio) row.querySelector('.order-item-precio').value = precio
  recalcTotal()
}
window.fillItemPrice = fillItemPrice

function removeOrderItem(idx) {
  document.getElementById(`order-item-${idx}`)?.remove()
  recalcTotal()
}
window.removeOrderItem = removeOrderItem

function recalcTotal() {
  let total = 0
  document.querySelectorAll('.order-item-row').forEach(row => {
    const qty    = parseFloat(row.querySelector('.order-item-qty').value) || 0
    const precio = parseFloat(row.querySelector('.order-item-precio').value) || 0
    const sub    = qty * precio
    row.querySelector('.order-item-sub').textContent = '$' + sub.toLocaleString('es-AR')
    total += sub
  })
  document.getElementById('ord-total-display').textContent = total.toLocaleString('es-AR')
}
window.recalcTotal = recalcTotal

async function saveNewOrder() {
  const btn = document.getElementById('btn-save-new-order')
  btn.disabled = true; btn.textContent = 'Guardando...'

  const items = []
  let total = 0
  for (const row of document.querySelectorAll('.order-item-row')) {
    const prod_id = row.querySelector('.order-item-prod').value
    const qty     = parseInt(row.querySelector('.order-item-qty').value) || 0
    const precio  = parseFloat(row.querySelector('.order-item-precio').value) || 0
    if (!prod_id || qty <= 0) continue
    const sub = qty * precio
    items.push({ producto_id: prod_id, cantidad: qty, precio_unitario: precio, subtotal: sub })
    total += sub
  }

  if (!items.length) {
    alert('Agregá al menos un producto.')
    btn.disabled = false; btn.textContent = 'Crear Pedido'
    return
  }

  const { data: pedido, error } = await supabase.from('pedidos').insert({
    cliente_nombre: document.getElementById('ord-cliente-nombre').value.trim(),
    cliente_email:  document.getElementById('ord-cliente-email').value.trim() || null,
    direccion_envio:document.getElementById('ord-direccion').value.trim() || null,
    estado:         document.getElementById('ord-estado').value,
    pago_estado:    document.getElementById('ord-pago-estado').value,
    pago_metodo:    document.getElementById('ord-pago-metodo').value,
    notas:          null,
    total,
  }).select().single()

  if (error) {
    alert('Error: ' + error.message)
    btn.disabled = false; btn.textContent = 'Crear Pedido'
    return
  }

  const itemsWithPedido = items.map(i => ({ ...i, pedido_id: pedido.id }))
  const { error: itemErr } = await supabase.from('pedido_items').insert(itemsWithPedido)
  if (itemErr) console.error('Error items:', itemErr)

  btn.disabled = false; btn.textContent = 'Crear Pedido'
  closeNewOrderModal()
  loadOrders()
}
window.saveNewOrder = saveNewOrder

// ── Editar pedido ─────────────────────────────────────────
async function openEditOrderModal(id) {
  editingOrderId = id

  const { data: o, error } = await supabase
    .from('pedidos')
    .select('*, pedido_items(id, cantidad, precio_unitario, subtotal, productos(nombre, sku))')
    .eq('id', id)
    .single()

  if (error) { alert('Error al cargar pedido'); return }

  const num    = `#GB-${String(o.id).slice(-4).toUpperCase()}`
  const nombre = clienteNombre(o)
  const fecha  = new Date(o.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })

  set('edit-order-num',  num)
  set('edit-order-meta', `${nombre} · ${fecha}`)

  document.getElementById('edit-ord-estado').value      = o.estado || 'pendiente'
  document.getElementById('edit-ord-pago-estado').value = o.pago_estado || 'pendiente'
  document.getElementById('edit-ord-pago-metodo').value = o.pago_metodo || 'efectivo'
  document.getElementById('edit-ord-seguimiento').value = o.numero_seguimiento || ''
  document.getElementById('edit-ord-notas').value       = o.notas || ''

  const itemsEl = document.getElementById('edit-order-items')
  if (!o.pedido_items?.length) {
    itemsEl.innerHTML = `<div style="color:var(--ink-mute);font-family:'Space Mono',monospace;font-size:11px;padding:8px 0">// Sin items registrados</div>`
  } else {
    itemsEl.innerHTML = o.pedido_items.map(it => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-2);border:1px solid var(--line);border-radius:3px">
        <div>
          <div style="font-size:13px;font-weight:600">${it.productos?.nombre || 'Producto'}</div>
          <div style="font-size:11px;color:var(--ink-mute);font-family:'Space Mono',monospace">${it.cantidad} × $${Number(it.precio_unitario).toLocaleString('es-AR')}</div>
        </div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--acid)">$${Number(it.subtotal).toLocaleString('es-AR')}</div>
      </div>`).join('')
  }

  document.getElementById('modal-edit-order').classList.add('open')
}
window.openEditOrderModal = openEditOrderModal

function closeEditOrderModal() {
  document.getElementById('modal-edit-order').classList.remove('open')
  editingOrderId = null
}
window.closeEditOrderModal = closeEditOrderModal

async function saveOrderStatus() {
  const btn = document.getElementById('btn-save-edit-order')
  btn.disabled = true; btn.textContent = 'Guardando...'

  const { error } = await supabase.from('pedidos').update({
    estado:               document.getElementById('edit-ord-estado').value,
    pago_estado:          document.getElementById('edit-ord-pago-estado').value,
    pago_metodo:          document.getElementById('edit-ord-pago-metodo').value,
    numero_seguimiento:   document.getElementById('edit-ord-seguimiento').value.trim() || null,
    notas:                document.getElementById('edit-ord-notas').value.trim() || null,
  }).eq('id', editingOrderId)

  btn.disabled = false; btn.textContent = 'Guardar'
  if (error) { alert('Error: ' + error.message); return }
  closeEditOrderModal()
  loadOrders()
}
window.saveOrderStatus = saveOrderStatus

async function deleteOrder(id) {
  if (!await customConfirm('¿Eliminar este pedido? Se borrarán también sus items. Esta acción no se puede deshacer.')) return
  await supabase.from('pedido_items').delete().eq('pedido_id', id)
  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) { alert('Error: ' + error.message); return }
  loadOrders()
}
window.deleteOrder = deleteOrder

async function deleteCurrentOrder() {
  if (editingOrderId) {
    closeEditOrderModal()
    await deleteOrder(editingOrderId)
  }
}
window.deleteCurrentOrder = deleteCurrentOrder

// ── Quick status inline ───────────────────────────────────
const QUICK_OPTIONS = {
  estado: [
    { value: 'pendiente',   label: 'Pendiente',   cls: 'pending'  },
    { value: 'pagado',      label: 'Pagado',       cls: 'ok'       },
    { value: 'enviado',     label: 'Enviado',      cls: 'shipped'  },
    { value: 'completado',  label: 'Completado',   cls: 'ok'       },
    { value: 'cancelado',   label: 'Cancelado',    cls: 'cancel'   },
  ],
  pago_estado: [
    { value: 'pendiente',   label: 'Pendiente',    cls: 'pending'  },
    { value: 'pagado',      label: 'Pagado',       cls: 'ok'       },
    { value: 'reembolsado', label: 'Reembolsado',  cls: 'cancel'   },
  ],
}

function showQuickStatus(event, orderId, field, currentValue) {
  event.stopPropagation()
  const popup = document.getElementById('quick-status-popup')
  const opts  = QUICK_OPTIONS[field] || []

  popup.innerHTML = opts.map(o => `
    <div class="qs-option ${o.cls}${o.value === currentValue ? ' qs-active' : ''}"
         onclick="applyQuickStatus('${orderId}','${field}','${o.value}')">
      <span class="qs-dot"></span>${o.label}
    </div>`).join('')

  const rect = event.currentTarget.getBoundingClientRect()
  popup.style.top  = (rect.bottom + 6) + 'px'
  popup.style.left = rect.left + 'px'
  popup.classList.add('open')
}

async function applyQuickStatus(orderId, field, value) {
  closeQuickStatus()
  const { error } = await supabase.from('pedidos').update({ [field]: value }).eq('id', orderId)
  if (error) { console.error('Quick status error:', error.message); return }
  loadOrders()
}

function closeQuickStatus() {
  document.getElementById('quick-status-popup')?.classList.remove('open')
}
document.addEventListener('click', closeQuickStatus)

window.showQuickStatus  = showQuickStatus
window.applyQuickStatus = applyQuickStatus

// ── Custom confirm ────────────────────────────────────────
function customConfirm(msg, okLabel = 'Eliminar') {
  return new Promise(resolve => {
    const overlay  = document.getElementById('modal-confirm')
    const msgEl    = document.getElementById('confirm-msg')
    const okBtn    = document.getElementById('confirm-ok')
    const cancelBtn = document.getElementById('confirm-cancel')

    msgEl.textContent  = msg
    okBtn.textContent  = okLabel
    overlay.classList.add('open')

    function cleanup(result) {
      overlay.classList.remove('open')
      okBtn.removeEventListener('click', onOk)
      cancelBtn.removeEventListener('click', onCancel)
      overlay.removeEventListener('click', onOverlay)
      resolve(result)
    }
    const onOk      = () => cleanup(true)
    const onCancel  = () => cleanup(false)
    const onOverlay = (e) => { if (e.target === overlay) cleanup(false) }

    okBtn.addEventListener('click', onOk)
    cancelBtn.addEventListener('click', onCancel)
    overlay.addEventListener('click', onOverlay)
  })
}

// ── Util ──────────────────────────────────────────────────
function set(id, val) {
  const el = document.getElementById(id)
  if (el) el.textContent = val
}

function slugify(str) {
  return str.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

init()
