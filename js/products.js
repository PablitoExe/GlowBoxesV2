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

// ── Cargar productos activos ──────────────────────────────
async function loadProductos() {
  const { data, error } = await supabase
    .from('productos')
    .select('*, categorias(nombre), marcas(nombre)')
    .eq('activo', true)
    .order('destacado', { ascending: false })
    .order('created_at', { ascending: false })

  if (error || !data?.length) return

  productos = data
  if (pageTotEl) pageTotEl.textContent = String(productos.length).padStart(2, '0')
  renderProducto(0)
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
      ? `<span class="accent">${w1.toUpperCase()}</span><br><span class="outline">${rest.toUpperCase()}</span>`
      : `<span class="accent">${w1.toUpperCase()}</span>`
  }

  // Descripción
  if (descEl) descEl.textContent = p.descripcion || ''

  // Specs desde atributos JSONB — hasta 3
  if (specsEl) {
    const attrs   = p.atributos || {}
    const entries = Object.entries(attrs).slice(0, 3)
    specsEl.innerHTML = entries.map(([label, val]) => `
      <div class="spec">
        <div class="spec-label">${label}</div>
        <div class="spec-value">${val}</div>
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
    btnCart.dataset.nombre = p.nombre
    btnCart.dataset.precio = precioFinal
    btnCart.dataset.imagen = p.imagen_url || ''
  }

  // Paginación
  if (pageNumEl) pageNumEl.textContent = String(idx + 1).padStart(2, '0')
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
