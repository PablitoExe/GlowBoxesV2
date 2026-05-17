const CART_KEY = 'gb_cart'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// ── Persistencia ──────────────────────────────────────────
function html(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function jsString(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, ' ')
}

function safeUrl(value = '') {
  const url = String(value || '').trim()
  if (!url) return ''
  if (url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url
  return ''
}

function isUuid(value) {
  return UUID_RE.test(String(value || ''))
}

function normalizeCartItem(item) {
  const productId = isUuid(item?.producto_id) ? item.producto_id : isUuid(item?.id) ? item.id : null
  if (!productId && (item?.id || item?.producto_id)) {
    console.warn('[cart] Item legacy sin UUID válido. Checkout intentará migrarlo:', item)
  }
  return {
    ...item,
    id: productId || item?.id || item?.slug || item?.sku || item?.nombre || '',
    producto_id: productId,
    slug: item?.slug || (!productId ? item?.id : item?.slug) || '',
    nombre: String(item?.nombre || item?.name || 'Producto'),
    precio: Math.max(0, Number(item?.precio) || 0),
    cantidad: Math.max(1, Number(item?.cantidad) || 1),
  }
}

function getCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY)) || []
    return Array.isArray(raw) ? raw.map(normalizeCartItem) : []
  }
  catch { return [] }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart.map(normalizeCartItem)))
  renderCart()
}

// ── Operaciones ───────────────────────────────────────────
function addToCart(product) {
  const cart = getCart()
  const cleanProduct = normalizeCartItem(product)
  if (!cleanProduct.producto_id) {
    console.warn('[cart] Producto agregado sin UUID real. Revisar data-id del botón:', product)
  }
  const existing = cart.find(i => i.producto_id
    ? i.producto_id === cleanProduct.producto_id
    : i.id === cleanProduct.id)
  if (existing) {
    existing.cantidad++
  } else {
    cart.push({ ...cleanProduct, cantidad: 1 })
  }
  saveCart(cart)
  openCart()
  animateBadge()
}

function removeFromCart(id) {
  saveCart(getCart().filter(i => i.id !== id))
}

function setQty(id, qty) {
  const cart = getCart()
  const item = cart.find(i => i.id === id)
  if (!item) return
  if (qty <= 0) { removeFromCart(id); return }
  item.cantidad = qty
  saveCart(cart)
}

function getTotal(cart) {
  return cart.reduce((s, i) => s + i.precio * i.cantidad, 0)
}

// ── Render ────────────────────────────────────────────────
function renderCart() {
  const cart      = getCart()
  const totalUnits = cart.reduce((s, i) => s + i.cantidad, 0)

  // Badge
  const badge = document.getElementById('cart-badge')
  if (badge) {
    badge.textContent = totalUnits
    badge.style.display = totalUnits > 0 ? 'flex' : 'none'
  }

  // Count label
  const countLabel = document.getElementById('cart-count-label')
  if (countLabel) countLabel.textContent = `${totalUnits} item${totalUnits !== 1 ? 's' : ''}`

  // Total
  const totalEl = document.getElementById('cart-total')
  if (totalEl) totalEl.textContent = `$${getTotal(cart).toLocaleString('es-AR')}`

  // Items
  const container = document.getElementById('cart-items')
  if (!container) return

  if (!cart.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
          <path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
        <p class="cart-empty-title">Tu carrito está vacío</p>
        <p class="cart-empty-sub">Agregá productos para comenzar</p>
      </div>`
    return
  }

  container.innerHTML = cart.map(item => {
    const id = html(jsString(item.id))
    const image = safeUrl(item.imagen)
    const name = html(item.nombre)
    return `
    <div class="cart-item">
      <div class="cart-item-img">
        ${image
          ? `<img src="${html(image)}" alt="${name}" loading="lazy" decoding="async">`
          : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${name}</div>
        <div class="cart-item-price">$${(item.precio * item.cantidad).toLocaleString('es-AR')}</div>
        <div class="cart-item-unit">$${Number(item.precio).toLocaleString('es-AR')} c/u</div>
      </div>
      <div class="cart-item-right">
        <div class="qty-control">
          <button class="qty-btn" onclick="setQty('${id}', ${item.cantidad - 1})">−</button>
          <span class="qty-val">${item.cantidad}</span>
          <button class="qty-btn" onclick="setQty('${id}', ${item.cantidad + 1})">+</button>
        </div>
        <button class="cart-remove" onclick="removeFromCart('${id}')" aria-label="Eliminar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`
  }).join('')
}

// ── Drawer open/close ─────────────────────────────────────
function openCart() {
  document.getElementById('cart-drawer')?.classList.add('open')
  document.body.style.overflow = 'hidden'
}
function closeCart() {
  document.getElementById('cart-drawer')?.classList.remove('open')
  document.body.style.overflow = ''
}

// ── Badge pulse animation ─────────────────────────────────
function animateBadge() {
  const badge = document.getElementById('cart-badge')
  if (!badge) return
  badge.classList.remove('pop')
  requestAnimationFrame(() => badge.classList.add('pop'))
}

// ── Event listeners ───────────────────────────────────────
document.getElementById('cart-close')?.addEventListener('click', closeCart)
document.getElementById('cart-drawer-overlay')?.addEventListener('click', closeCart)
document.getElementById('cart-continue')?.addEventListener('click', closeCart)
document.querySelector('.icon-btn[aria-label="Carrito"]')?.addEventListener('click', openCart)
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart() })

// Botón "Comprar Ahora" del hero
document.getElementById('btn-add-cart')?.addEventListener('click', function () {
  addToCart({
    id:     this.dataset.id,
    producto_id: this.dataset.productoId || this.dataset.id,
    slug:   this.dataset.slug,
    sku:    this.dataset.sku,
    nombre: this.dataset.nombre,
    precio: Number(this.dataset.precio),
    imagen: this.dataset.imagen,
  })
})

// Exponer para uso desde HTML (qty controls en el drawer)
window.setQty         = setQty
window.removeFromCart = removeFromCart

// ── Init ──────────────────────────────────────────────────
renderCart()
