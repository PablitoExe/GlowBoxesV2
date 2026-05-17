import { supabase } from './supabase.js'

const CART_KEY = 'gb_cart'
const PROOF_BUCKET = 'comprobantes'
const PROOF_MAX_BYTES = 10 * 1024 * 1024
const PROOF_ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf'])
const PROOF_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CHECKOUT_CONFIG = {
  currency: 'ARS',
  vatRate: 0.21,
  taxMode: 'included',
  transferDiscountRate: 0.10,
  shipping: {
    pickup: { label: 'Retiro en local', summaryLabel: 'RETIRO POR LOCAL', cost: 0 },
    own: { label: 'Envío Glow Express', summaryLabel: 'ENVÍO', cost: 3500 },
    correo: { label: 'Correo Argentino', summaryLabel: 'ENVÍO', cost: 5890 },
  },
  mercadoPago: {
    provider: 'configurable-local',
    allowedInstallments: [1, 2, 3],
    buyerPaysFinancingCost: true,
    rates: {
      1: { feeRate: 0, label: '1 pago sin interés' },
      2: { feeRate: 0.095, label: '2 cuotas sin interés' },
      3: { feeRate: 0.145, label: '3 cuotas sin interés' },
    },
  },
}

const state = {
  ship: 'own',
  pay: 'mp',
  installments: 1,
  activeCoupon: null,
  transferProof: null,
  lastTotals: null,
}

const $ = id => document.getElementById(id)
const money = value => `<span class="currency">$</span>${fmt(value)}`
const clampMoney = value => Math.max(0, Math.round(Number.isFinite(Number(value)) ? Number(value) : 0))
const fmt = value => clampMoney(value).toLocaleString('es-AR')

function isUuid(value) {
  return UUID_RE.test(String(value || ''))
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function validProductId(item) {
  const candidate = item?.producto_id || item?.product_id || item?.id
  return isUuid(candidate) ? candidate : null
}

function invalidCartItems(cart) {
  return cart.filter(item => !validProductId(item))
}

function normalizeCartItem(item) {
  const productId = validProductId(item)
  if (!productId && (item?.id || item?.producto_id || item?.product_id)) {
    console.warn('[checkout] Producto de carrito sin UUID válido. Se intentará migrar o se enviará sin product_id:', item)
  }
  return {
    ...item,
    id: productId || item?.id || item?.slug || item?.sku || item?.nombre || '',
    producto_id: productId,
    slug: item?.slug || (!productId ? item?.id : item?.slug) || '',
    nombre: String(item?.nombre || item?.name || 'Producto'),
    sku: item?.sku || null,
    imagen: item?.imagen || item?.imagen_url || '',
    cantidad: Math.max(1, Number(item?.cantidad) || 1),
    precio: Math.max(0, Number(item?.precio) || 0),
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart))
}

function getCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY)) || []
    if (!Array.isArray(raw)) return []
    return raw.map(normalizeCartItem).filter(item => item.cantidad > 0 && item.precio >= 0)
  } catch {
    return []
  }
}

async function migrateLegacyCart() {
  const cart = getCart()
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, slug, sku, precio, precio_oferta, imagen_url')

  if (error) {
    console.warn('[checkout] No se pudo migrar el carrito legacy contra productos:', error)
    saveCart(cart)
    return
  }

  const products = data || []
  const byId = new Map(products.map(p => [p.id, p]))
  const bySlug = new Map(products.map(p => [normalizeText(p.slug), p]))
  const bySku = new Map(products.filter(p => p.sku).map(p => [normalizeText(p.sku), p]))
  const byName = new Map(products.map(p => [normalizeText(p.nombre), p]))

  const migrated = cart.map(item => {
    if (item.producto_id) {
      const product = byId.get(item.producto_id)
      if (!product) {
        console.warn('[checkout] El carrito tiene un UUID de producto que no existe en productos. Se preserva la línea sin product_id:', item)
        return { ...item, producto_id: null }
      }
      return {
        ...item,
        id: product.id,
        producto_id: product.id,
        slug: product.slug || item.slug || '',
        sku: product.sku || item.sku || null,
        nombre: product.nombre || item.nombre,
        precio: Number(product.precio_oferta || product.precio || item.precio || 0),
        imagen: product.imagen_url || item.imagen || '',
      }
    }
    const candidates = [item.id, item.slug, item.sku, item.nombre].map(normalizeText).filter(Boolean)
    const product = candidates.map(key => bySlug.get(key) || bySku.get(key) || byName.get(key)).find(Boolean)
    if (!product) {
      console.warn('[checkout] No se encontró producto para migrar item legacy. Se preserva sin UUID:', item)
      return item
    }
    return {
      ...item,
      id: product.id,
      producto_id: product.id,
      slug: product.slug || item.slug || '',
      sku: product.sku || item.sku || null,
      nombre: product.nombre || item.nombre,
      precio: Number(product.precio_oferta || product.precio || item.precio || 0),
      imagen: product.imagen_url || item.imagen || '',
    }
  })

  saveCart(migrated)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]))
}

function cartSubtotal(cart = getCart()) {
  return clampMoney(cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0))
}

function canUseDiscounts() {
  return state.pay === 'transfer' || (state.pay === 'mp' && state.installments === 1)
}

function getMpRate(installments = state.installments) {
  return CHECKOUT_CONFIG.mercadoPago.rates[installments] || CHECKOUT_CONFIG.mercadoPago.rates[1]
}

function calculateCouponDiscount(subtotal) {
  const coupon = state.activeCoupon
  if (!coupon || !canUseDiscounts()) return 0
  const minPurchase = Math.max(0, Number(coupon.min_compra || coupon.minimo_compra || 0))
  if (subtotal < minPurchase) return 0

  const amount = Math.max(0, Number(coupon.descuento || coupon.valor || 0))
  const discount = coupon.tipo === 'porcentaje'
    ? subtotal * (amount / 100)
    : amount

  return Math.min(subtotal, clampMoney(discount))
}

function calculateTotals() {
  const cart = getCart()
  const subtotal = cartSubtotal(cart)
  const shipping = CHECKOUT_CONFIG.shipping[state.ship] || CHECKOUT_CONFIG.shipping.own
  const shippingCost = clampMoney(shipping.cost)
  const couponDiscount = calculateCouponDiscount(subtotal)
  const transferDiscount = canUseDiscounts() && state.pay === 'transfer'
    ? clampMoney((subtotal + shippingCost - couponDiscount) * CHECKOUT_CONFIG.transferDiscountRate)
    : 0

  const discountedBase = Math.max(0, subtotal + shippingCost - couponDiscount - transferDiscount)
  const mpRate = state.pay === 'mp' ? getMpRate() : { feeRate: 0, label: 'Transferencia' }
  const mpFeeBase = state.pay === 'mp' && CHECKOUT_CONFIG.mercadoPago.buyerPaysFinancingCost
    ? discountedBase * Number(mpRate.feeRate || 0)
    : 0
  const mpFeeVat = mpFeeBase * CHECKOUT_CONFIG.vatRate
  const mpFee = clampMoney(mpFeeBase + mpFeeVat)
  const total = clampMoney(discountedBase + mpFee)
  const includedVat = CHECKOUT_CONFIG.taxMode === 'included'
    ? clampMoney((subtotal + shippingCost - couponDiscount - transferDiscount + mpFee) * CHECKOUT_CONFIG.vatRate / (1 + CHECKOUT_CONFIG.vatRate))
    : clampMoney((subtotal + shippingCost - couponDiscount - transferDiscount + mpFee) * CHECKOUT_CONFIG.vatRate)

  return {
    cart,
    subtotal,
    shipping,
    shippingCost,
    couponDiscount,
    transferDiscount,
    mpFee,
    mpFeeRate: Number(mpRate.feeRate || 0),
    iva: includedVat,
    total,
    installmentAmount: clampMoney(total / Math.max(1, state.installments)),
  }
}

function getBuyerData() {
  const nombre = $('buyerNombre')?.value.trim() || ''
  const apellido = $('buyerApellido')?.value.trim() || ''
  return {
    nombre,
    apellido,
    fullName: [nombre, apellido].filter(Boolean).join(' '),
    email: $('buyerEmail')?.value.trim() || '',
    telefono: $('buyerTelefono')?.value.trim() || '',
    dni: $('buyerDni')?.value.trim() || '',
  }
}

function getShippingData() {
  if (state.ship === 'pickup') return { texto: 'Retiro por local', localidad: '', cp: '', notas: '' }
  const direccion = $('shipDireccion')?.value.trim() || ''
  const localidad = $('shipLocalidad')?.value.trim() || ''
  const cp = $('shipCp')?.value.trim() || ''
  const notas = $('shipNotas')?.value.trim() || ''
  return { texto: [direccion, localidad, cp].filter(Boolean).join(' · '), direccion, localidad, cp, notas }
}

function pulseSummary() {
  const card = document.querySelector('.summary-card')
  if (!card) return
  card.classList.remove('recalc')
  requestAnimationFrame(() => {
    card.classList.add('recalc')
    window.setTimeout(() => card.classList.remove('recalc'), 260)
  })
}

function setRowVisible(row, visible) {
  if (row) row.style.display = visible ? '' : 'none'
}

function setCouponMessage(message = '', tone = '') {
  const el = $('couponMessage')
  if (!el) return
  el.textContent = message
  el.className = `coupon-message ${tone}`.trim()
}

function setProofMessage(message = '', tone = '') {
  const el = $('transferProofMessage')
  if (!el) return
  el.textContent = message
  el.className = `proof-message ${tone}`.trim()
}

function resetProofProgress() {
  const progress = $('transferProofProgress')
  const bar = progress?.querySelector('span')
  progress?.classList.remove('active')
  if (bar) bar.style.width = '0%'
}

function setProofProgress(value) {
  const progress = $('transferProofProgress')
  const bar = progress?.querySelector('span')
  progress?.classList.add('active')
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, value))}%`
}

async function isReadableProof(file, ext) {
  if (ext === 'pdf') {
    const header = await file.slice(0, 5).text()
    return header === '%PDF-'
  }
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    bitmap.close?.()
  }
  return true
}

async function validateProofFile(file) {
  if (!file) throw new Error('Debés subir el comprobante de transferencia para continuar.')
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (!PROOF_ALLOWED_EXT.has(ext)) throw new Error('Formato no permitido. Usá JPG, PNG, WEBP o PDF.')
  if (!PROOF_ALLOWED_MIME.has(file.type)) throw new Error('El tipo de archivo no coincide con un comprobante válido.')
  if (file.size <= 0) throw new Error('El archivo está vacío o corrupto.')
  if (file.size > PROOF_MAX_BYTES) throw new Error('El comprobante no puede superar los 10MB.')
  try {
    await isReadableProof(file, ext)
  } catch {
    throw new Error('No pudimos leer el archivo. Subí una imagen o PDF válido.')
  }
  return { ext, mime: file.type }
}

function renderProofPreview(file) {
  const box = $('transferProofBox')
  const name = $('transferProofName')
  const status = $('transferProofStatus')
  const preview = $('transferProofPreview')
  box?.classList.add('ready')
  if (name) name.textContent = file.name
  if (status) status.textContent = '// LISTO PARA ENVIAR'
  if (preview) {
    const isImage = file.type.startsWith('image/')
    const url = isImage ? URL.createObjectURL(file) : ''
    preview.classList.add('open')
    preview.innerHTML = `${isImage ? `<img src="${url}" alt="">` : '<div class="proof-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg></div>'}<div class="proof-file"><strong style="color:var(--ink)">${escapeHtml(file.name)}</strong><br>${(file.size / 1024 / 1024).toFixed(2)} MB · ${escapeHtml(file.type)}</div>`
  }
}

async function setTransferProof(file) {
  try {
    await validateProofFile(file)
    state.transferProof = file
    renderProofPreview(file)
    resetProofProgress()
    setProofMessage('Comprobante cargado correctamente.', 'ok')
  } catch (error) {
    state.transferProof = null
    $('transferProofBox')?.classList.remove('ready')
    $('transferProofPreview')?.classList.remove('open')
    setProofMessage(error.message, 'warn')
  }
}

function proofFileName(orderNumber, userId, ext) {
  const safeOrder = String(orderNumber || 'pedido').replace(/[^a-z0-9_-]/gi, '')
  const safeUser = String(userId || 'user').replace(/[^a-z0-9_-]/gi, '')
  return `comprobante_${safeOrder}_${Date.now()}_${safeUser}.${ext}`
}

async function uploadTransferProof(session, orderNumber) {
  const { ext, mime } = await validateProofFile(state.transferProof)
  const filename = proofFileName(orderNumber, session.user.id, ext)
  const path = `${session.user.id}/${filename}`
  setProofProgress(35)
  const { error } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(path, state.transferProof, { contentType: mime, upsert: false })
  if (error) throw error
  setProofProgress(100)
  setProofMessage('Comprobante subido correctamente.', 'ok')
  return {
    url: path,
    filename,
    uploadedAt: new Date().toISOString(),
  }
}

function renderSummaryItems() {
  const cart = getCart()
  const container = $('summary-items')
  const countEl = $('summary-count')
  const totalUnits = cart.reduce((sum, item) => sum + item.cantidad, 0)

  if (countEl) countEl.textContent = `// ${totalUnits} item${totalUnits !== 1 ? 's' : ''}`
  if (!container) return

  if (!cart.length) {
    container.innerHTML = `<div style="padding:24px;text-align:center;font-family:'Space Mono',monospace;font-size:11px;color:var(--ink-mute);letter-spacing:.1em">
      // Carrito vacío — <a href="/" style="color:var(--violet-glow);text-decoration:underline">Volver</a></div>`
    return
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-thumb" style="${item.imagen ? `background-image:url(${escapeHtml(item.imagen)});background-size:cover;background-position:center` : ''}">
        ${item.imagen ? '' : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 2 12 6 8 2"/><path d="M5 8h14l-1 14H6Z"/></svg>`}
        <span class="qty">${item.cantidad}</span>
      </div>
      <div class="cart-info">
        <div class="cart-name">${escapeHtml(item.nombre)}</div>
        <div class="cart-meta">$${fmt(item.precio)} c/u</div>
      </div>
      <div class="cart-price">${money(item.precio * item.cantidad)}</div>
    </div>`).join('')
}

function renderInstallments(totals) {
  document.querySelectorAll('.install-row[data-installments]').forEach(row => {
    const installments = Number(row.dataset.installments)
    const previous = state.installments
    state.installments = installments
    const preview = calculateTotals()
    state.installments = previous

    row.classList.toggle('selected', installments === state.installments)
    const totalEl = row.querySelector('.total')
    if (totalEl) totalEl.innerHTML = money(preview.installmentAmount)
    const nameEl = row.querySelector('.name')
    if (nameEl) {
      const rate = getMpRate(installments)
      const feeText = rate.feeRate > 0 ? ` · comisión ${(rate.feeRate * 100).toFixed(1)}% + IVA` : ''
      nameEl.title = `${rate.label}${feeText}`
    }
  })

  const mpDesc = document.querySelector('.pay[data-pay="mp"] .pay-desc')
  if (mpDesc) {
    mpDesc.textContent = state.installments === 1
      ? '// Tarjeta · Saldo · 1 pago'
      : `// ${state.installments} cuotas · ${money(totals.installmentAmount)} por cuota`
  }
}

function syncCouponVisibility() {
  const couponBox = $('couponBox')
  const input = $('couponCode')
  const button = $('couponApply')
  const allowed = canUseDiscounts()

  couponBox?.classList.toggle('is-hidden', !allowed)
  if (input) input.disabled = !allowed
  if (button) button.disabled = !allowed

  if (!allowed) {
    if (state.activeCoupon) state.activeCoupon = null
    if (input) input.value = ''
    setCouponMessage('Los descuentos y cupones solo aplican para transferencia o pago en 1 cuota.', 'warn')
  } else if (!state.activeCoupon) {
    setCouponMessage('')
  }
}

function syncProofVisibility() {
  const box = $('transferProofBox')
  if (!box) return
  box.style.display = state.pay === 'transfer' ? '' : 'none'
  if (state.pay !== 'transfer') {
    setProofMessage('')
    resetProofProgress()
  }
}

function renderTotals(animate = true) {
  syncCouponVisibility()
  syncProofVisibility()
  const totals = calculateTotals()
  state.lastTotals = totals

  const subtotalEl = $('summary-subtotal')
  if (subtotalEl) subtotalEl.innerHTML = money(totals.subtotal)

  const couponRow = $('couponDiscountRow')
  setRowVisible(couponRow, totals.couponDiscount > 0)
  if ($('couponDiscountLabel')) $('couponDiscountLabel').textContent = state.activeCoupon ? `Cupón ${state.activeCoupon.codigo}` : 'Cupón'
  if ($('couponDiscountValue')) $('couponDiscountValue').innerHTML = `-${money(totals.couponDiscount)}`

  const shipLabel = $('shipLabel')
  if (shipLabel) shipLabel.textContent = totals.shipping.summaryLabel
  const shipValue = $('shipValue')
  if (shipValue) shipValue.innerHTML = totals.shippingCost === 0 ? '<span class="currency">$</span>0' : money(totals.shippingCost)

  const transferRow = $('payDiscountRow')
  setRowVisible(transferRow, totals.transferDiscount > 0)
  if ($('payDiscountValue')) $('payDiscountValue').innerHTML = `-${money(totals.transferDiscount)}`

  const mpFeeRow = $('mpFeeRow')
  setRowVisible(mpFeeRow, totals.mpFee > 0)
  if ($('mpFeeLabel')) $('mpFeeLabel').textContent = `Comisión Mercado Pago ${state.installments} cuota${state.installments > 1 ? 's' : ''}`
  if ($('mpFeeValue')) $('mpFeeValue').innerHTML = money(totals.mpFee)

  const installmentSummary = $('installmentSummaryValue')
  if (installmentSummary) {
    installmentSummary.innerHTML = state.pay === 'mp'
      ? (state.installments === 1 ? '1 pago' : `${state.installments} cuotas de ${money(totals.installmentAmount)}`)
      : 'Transferencia'
  }

  if ($('taxValue')) $('taxValue').innerHTML = money(totals.iva)
  if ($('grandTotal')) $('grandTotal').innerHTML = money(totals.total)

  const transferAmount = $('transferAmount')
  if (transferAmount) {
    const original = totals.subtotal + totals.shippingCost - totals.couponDiscount
    transferAmount.innerHTML = `${money(totals.total)}${totals.transferDiscount ? ` <span style="color:var(--ink-mute);font-size:11px;text-decoration:line-through;margin-left:6px">${money(original)}</span>` : ''}`
  }

  renderInstallments(totals)
  if (animate) pulseSummary()
  return totals
}

async function applyCoupon() {
  const input = $('couponCode')
  const code = input?.value.trim().toUpperCase()
  if (!code) {
    setCouponMessage('Ingresá un código de cupón.', 'warn')
    return
  }
  if (!canUseDiscounts()) {
    state.activeCoupon = null
    renderTotals()
    return
  }

  const btn = $('couponApply')
  if (btn) {
    btn.disabled = true
    btn.textContent = '...'
  }

  try {
    const { data, error } = await supabase
      .from('cupones')
      .select('codigo, tipo, descuento, min_compra, max_usos, usos_actuales, fecha_fin, activo')
      .eq('codigo', code)
      .eq('activo', true)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      state.activeCoupon = null
      setCouponMessage('Cupón no válido o vencido.', 'warn')
      renderTotals()
      return
    }
    if (data.max_usos && Number(data.usos_actuales || 0) >= Number(data.max_usos)) {
      state.activeCoupon = null
      setCouponMessage('Este cupón ya alcanzó su límite de usos.', 'warn')
      renderTotals()
      return
    }
    if (data.fecha_fin && new Date(data.fecha_fin) < new Date(new Date().toDateString())) {
      state.activeCoupon = null
      setCouponMessage('Este cupón está vencido.', 'warn')
      renderTotals()
      return
    }

    state.activeCoupon = data
    const totals = renderTotals()
    if (!totals.couponDiscount) {
      state.activeCoupon = null
      setCouponMessage('El cupón no aplica al subtotal actual.', 'warn')
      renderTotals()
      return
    }
    setCouponMessage(`Cupón ${data.codigo} aplicado correctamente.`, 'ok')
  } catch (error) {
    console.warn('No se pudo validar el cupón', error)
    state.activeCoupon = null
    setCouponMessage('No pudimos validar el cupón. Intentá de nuevo.', 'warn')
    renderTotals()
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Aplicar'
    }
  }
}

function bindStepper() {
  const stepEls = document.querySelectorAll('.step')
  const lineEls = document.querySelectorAll('.step-line')
  const pages = document.querySelectorAll('.step-page')

  window.goStep = function goStep(n) {
    stepEls.forEach(el => {
      const step = parseInt(el.dataset.step)
      el.classList.toggle('active', step === n)
      el.classList.toggle('done', step < n)
      const circle = el.querySelector('.step-circle')
      if (!circle) return
      circle.innerHTML = step < n
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
        : String(step).padStart(2, '0')
    })
    lineEls.forEach((line, index) => line.classList.toggle('done', index < n - 1))
    pages.forEach(page => page.classList.toggle('active', parseInt(page.dataset.page) === n))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function bindShipping() {
  document.querySelectorAll('.ship').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.ship').forEach(item => item.classList.remove('selected'))
      option.classList.add('selected')
      state.ship = option.dataset.ship || 'own'
      renderTotals()
    })
  })
}

function bindPayments() {
  document.querySelectorAll('.pay').forEach(option => {
    option.querySelector('.pay-header')?.addEventListener('click', () => {
      document.querySelectorAll('.pay').forEach(item => item.classList.remove('selected'))
      option.classList.add('selected')
      state.pay = option.dataset.pay || 'mp'
      if (state.pay === 'transfer') state.installments = 1
      renderTotals()
    })
  })

  document.querySelectorAll('.install-row[data-installments]').forEach(row => {
    row.addEventListener('click', event => {
      event.stopPropagation()
      state.pay = 'mp'
      state.installments = Number(row.dataset.installments) || 1
      document.querySelectorAll('.pay').forEach(item => item.classList.toggle('selected', item.dataset.pay === 'mp'))
      renderTotals()
    })
  })
}

function bindCoupons() {
  $('couponApply')?.addEventListener('click', applyCoupon)
  $('couponCode')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault()
      applyCoupon()
    }
  })
  $('couponCode')?.addEventListener('input', event => {
    event.target.value = event.target.value.toUpperCase()
    if (state.activeCoupon && event.target.value.trim() !== state.activeCoupon.codigo) {
      state.activeCoupon = null
      setCouponMessage('')
      renderTotals()
    }
  })
}

function bindTransferProof() {
  const drop = $('transferProofDrop')
  const input = $('transferProofInput')
  drop?.addEventListener('click', () => input?.click())
  input?.addEventListener('change', event => setTransferProof(event.target.files?.[0]))
  ;['dragenter', 'dragover'].forEach(type => {
    drop?.addEventListener(type, event => {
      event.preventDefault()
      drop.classList.add('dragging')
    })
  })
  ;['dragleave', 'drop'].forEach(type => {
    drop?.addEventListener(type, event => {
      event.preventDefault()
      drop.classList.remove('dragging')
    })
  })
  drop?.addEventListener('drop', event => setTransferProof(event.dataTransfer?.files?.[0]))
}

function resetFinalizeButton(btn) {
  if (!btn) return
  btn.disabled = false
  btn.textContent = 'Confirmar Pedido'
}

function friendlyOrderError(error) {
  const msg = error?.message || ''
  const code = error?.code || ''
  if (code === '23505' || msg.includes('unique constraint') || msg.includes('duplicate key')) {
    return 'Ya existe un pedido con ese número. Intentá de nuevo en unos segundos.'
  }
  if (code === '23503' || msg.includes('foreign key')) {
    return 'Uno o más productos del carrito ya no están disponibles. Actualizá el carrito.'
  }
  if (code === '42501' || msg.includes('permission denied') || msg.includes('row-level security')) {
    return 'No tenés permiso para realizar esta acción. Verificá que hayas iniciado sesión correctamente.'
  }
  if (msg.includes('Only admins can update protected profile fields')) {
    return 'No podés modificar esos campos de perfil.'
  }
  if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
    return 'Sin conexión. Verificá tu internet y volvé a intentarlo.'
  }
  return 'No pudimos procesar el pedido. Intentá de nuevo.'
}

function validateBuyerFields() {
  const nombre = $('buyerNombre')?.value.trim()
  const apellido = $('buyerApellido')?.value.trim()
  const email = $('buyerEmail')?.value.trim()
  const telefono = $('buyerTelefono')?.value.trim()
  const dni = $('buyerDni')?.value.trim()

  if (!nombre) return { ok: false, field: 'buyerNombre', msg: 'El nombre es obligatorio.' }
  if (!apellido) return { ok: false, field: 'buyerApellido', msg: 'El apellido es obligatorio.' }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, field: 'buyerEmail', msg: 'Ingresá un email válido.' }
  if (!telefono) return { ok: false, field: 'buyerTelefono', msg: 'El teléfono es obligatorio.' }
  if (!dni) return { ok: false, field: 'buyerDni', msg: 'El DNI/CUIT es obligatorio.' }
  return { ok: true }
}

function validateShipping() {
  if (state.ship === 'pickup') return { ok: true }
  const direccion = $('shipDireccion')?.value.trim()
  if (!direccion) return { ok: false, field: 'shipDireccion', msg: 'La dirección de entrega es obligatoria.' }
  return { ok: true }
}

function highlightField(fieldId) {
  const el = $(fieldId)
  if (!el) return
  el.focus()
  el.classList.add('field-error')
  el.addEventListener('input', () => el.classList.remove('field-error'), { once: true })
}

function validateStep1() {
  const buyerCheck = validateBuyerFields()
  if (!buyerCheck.ok) {
    goStep(1)
    highlightField(buyerCheck.field)
    const wrap = $(buyerCheck.field)?.closest('.card')
    wrap?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => alert(buyerCheck.msg), 80)
    return false
  }
  const shipCheck = validateShipping()
  if (!shipCheck.ok) {
    goStep(1)
    highlightField(shipCheck.field)
    const wrap = $(shipCheck.field)?.closest('.card')
    wrap?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => alert(shipCheck.msg), 80)
    return false
  }
  goStep(2)
  return true
}
window.validateStep1 = validateStep1

function copyText(btn, text) {
  navigator.clipboard.writeText(text).catch(() => {})
  const original = btn.innerHTML
  btn.classList.add('copied')
  btn.textContent = 'Copiado correctamente'
  setTimeout(() => {
    btn.classList.remove('copied')
    btn.innerHTML = original
  }, 1600)
}
window.copyText = copyText

async function finalizePay() {
  const btn = document.querySelector('[onclick="finalizePay()"]')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Procesando...'
  }

  const totals = renderTotals(false)
  if (!totals.cart.length) {
    alert('Tu carrito está vacío.')
    resetFinalizeButton(btn)
    return
  }

  const invalidItems = invalidCartItems(totals.cart)
  if (invalidItems.length) {
    console.warn('[checkout] Compra bloqueada: hay productos sin UUID real en el carrito.', invalidItems)
    alert('Algunos productos del carrito ya no están disponibles. Eliminá esos productos y volvé a agregarlos desde el catálogo.')
    resetFinalizeButton(btn)
    return
  }

  const buyerCheck = validateBuyerFields()
  if (!buyerCheck.ok) {
    goStep(1)
    highlightField(buyerCheck.field)
    alert(buyerCheck.msg)
    resetFinalizeButton(btn)
    return
  }

  const shipCheck = validateShipping()
  if (!shipCheck.ok) {
    goStep(1)
    highlightField(shipCheck.field)
    alert(shipCheck.msg)
    resetFinalizeButton(btn)
    return
  }

  if (state.pay === 'transfer' && !state.transferProof) {
    setProofMessage('Debés subir el comprobante de transferencia para continuar.', 'warn')
    $('transferProofDrop')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    resetFinalizeButton(btn)
    return
  }

  const number = `GB-${Date.now().toString().slice(-6)}`
  const buyer = getBuyerData()
  const shippingData = getShippingData()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    setProofMessage('Iniciá sesión para confirmar el pedido de forma segura.', 'warn')
    resetFinalizeButton(btn)
    return
  }

  let proof = null

  if (state.pay === 'transfer') {
    try {
      proof = await uploadTransferProof(session, number)
    } catch (error) {
      console.warn('Proof upload failed', error)
      setProofMessage(error.message || 'No pudimos subir el comprobante. Intentá de nuevo.', 'warn')
      resetFinalizeButton(btn)
      return
    }
  }

  try {
    const items = totals.cart.map(item => ({
      producto_id: validProductId(item),
      nombre_producto: item.nombre,
      sku: item.sku || null,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
    }))

    // Atomic RPC: pedido + items in one DB transaction — no orphan possible on items failure.
    const { error: rpcErr } = await supabase.rpc('create_order', {
        p_numero:                   number,
        p_cliente_nombre:           buyer.fullName || null,
        p_cliente_email:            buyer.email || null,
        p_estado:                   state.pay === 'transfer' ? 'pendiente' : 'confirmado',
        p_metodo_pago:              state.pay === 'mp' ? 'mercado_pago' : 'transferencia',
        p_pago_metodo:              state.pay === 'mp' ? 'mercado_pago' : 'transferencia',
        p_pago_estado:              state.pay === 'transfer' ? 'pendiente' : 'acreditado',
        p_metodo_envio:             state.ship,
        p_subtotal:                 totals.subtotal,
        p_descuento:                totals.couponDiscount + totals.transferDiscount,
        p_costo_envio:              totals.shippingCost,
        p_total:                    totals.total,
        p_cupon_codigo:             state.activeCoupon?.codigo || null,
        p_direccion_envio:          shippingData,
        p_comprobante_url:          proof?.url || null,
        p_comprobante_filename:     proof?.filename || null,
        p_comprobante_uploaded_at:  proof?.uploadedAt || null,
        p_notas:                    state.pay === 'mp'
          ? `Mercado Pago: ${state.installments} cuota(s). Comisión ${fmt(totals.mpFee)}. IVA incluido ${fmt(totals.iva)}.`
          : `Transferencia bancaria. IVA incluido ${fmt(totals.iva)}.`,
        p_items: items,
      })

    if (rpcErr) throw rpcErr
  } catch (error) {
    console.warn('Supabase order save failed', error)
    if (proof?.url) await supabase.storage.from(PROOF_BUCKET).remove([proof.url]).catch(() => {})
    setProofMessage(friendlyOrderError(error), 'warn')
    resetFinalizeButton(btn)
    return
  }

  localStorage.removeItem(CART_KEY)

  $('orderNumber').textContent = `// #${number}`
  $('orderNumberBig').textContent = `#${number}`
  $('confirmEmail').textContent = buyer.email || 'tu email'
  const createdAt = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase()
  $('confirmCreatedAt').textContent = `CREADO ${createdAt}`
  $('step-created-at').textContent = `${createdAt} — COMPLETADO`

  const paymentStatus = $('paymentStatus')
  const paymentStatusDesc = $('paymentStatusDesc')
  const stepWhen = $('step-payment-when')
  const stepTitle = $('step-payment-title')
  const stepDesc = $('step-payment-desc')

  if (state.pay === 'transfer') {
    paymentStatus.textContent = 'Pendiente'
    paymentStatus.style.color = 'var(--warn)'
    paymentStatusDesc.textContent = 'Comprobante recibido. Pago pendiente de validación'
    stepWhen.textContent = 'PRÓXIMO PASO'
    stepTitle.textContent = 'Realizar transferencia'
    stepDesc.textContent = 'Recibimos tu comprobante. Un administrador validará el pago.'
  } else {
    paymentStatus.textContent = 'Acreditado'
    paymentStatus.style.color = 'var(--acid)'
    paymentStatusDesc.textContent = state.installments === 1
      ? 'Pago confirmado por Mercado Pago'
      : `Pago confirmado por Mercado Pago · ${state.installments} cuotas de ${fmt(totals.installmentAmount)}`
    stepWhen.textContent = 'COMPLETADO'
    stepTitle.textContent = 'Pago confirmado'
    stepDesc.textContent = 'Tu pago se acreditó correctamente vía Mercado Pago.'
  }

  $('confirmShip').textContent = totals.shipping.label
  $('confirmShipAddress').textContent = shippingData.texto || 'A coordinar'
  $('confirmTotal').innerHTML = money(totals.total)

  window.goStep(3)
}
window.finalizePay = finalizePay

async function getMercadoPagoRatesFromProvider() {
  return CHECKOUT_CONFIG.mercadoPago.rates
}

async function initCheckout() {
  await getMercadoPagoRatesFromProvider()
  await migrateLegacyCart()
  renderSummaryItems()
  bindStepper()
  bindShipping()
  bindPayments()
  bindCoupons()
  bindTransferProof()
  renderTotals(false)
}

initCheckout()
