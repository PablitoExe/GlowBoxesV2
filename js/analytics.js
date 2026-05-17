const DEFAULT_CONFIG = {
  ga4MeasurementId: 'G-REPLACE_ME',
  metaPixelId: 'META_PIXEL_REPLACE_ME',
  currency: 'ARS',
  debugParam: 'analytics_debug',
}

const config = {
  ...DEFAULT_CONFIG,
  ...(window.GLOW_ANALYTICS_CONFIG || {}),
}

const PLACEHOLDER_VALUES = new Set([
  '',
  'G-REPLACE_ME',
  'GA4_MEASUREMENT_ID',
  'META_PIXEL_REPLACE_ME',
  'META_PIXEL_ID',
])

const state = {
  initialized: false,
  gaLoaded: false,
  metaLoaded: false,
  eventKeys: new Set(),
}

function isDebug() {
  try {
    return new URLSearchParams(window.location.search).get(config.debugParam) === 'true'
      || localStorage.getItem(config.debugParam) === 'true'
  } catch {
    return false
  }
}

function debugLog(name, payload) {
  if (isDebug()) console.info('[analytics]', name, payload)
}

function isConfigured(value) {
  return Boolean(value && !PLACEHOLDER_VALUES.has(String(value).trim()))
}

function safeNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeItem(item = {}) {
  const id = item.producto_id || item.product_id || item.item_id || item.id || item.sku || ''
  const name = item.nombre || item.name || item.product_name || item.item_name || 'Producto'
  const price = safeNumber(item.precio ?? item.price ?? item.precio_unitario)
  const quantity = Math.max(1, safeNumber(item.cantidad ?? item.quantity ?? 1))
  const category = item.categoria || item.category || item.category_name || item.categorias?.nombre || undefined
  const brand = item.marca || item.brand || item.brand_name || item.marcas?.nombre || undefined

  return {
    item_id: String(id),
    item_name: String(name),
    item_category: category ? String(category) : undefined,
    item_brand: brand ? String(brand) : undefined,
    price,
    quantity,
  }
}

function cleanPayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )
}

function gaParams(payload = {}) {
  const items = (payload.items || []).map(normalizeItem)
  return cleanPayload({
    currency: payload.currency || config.currency,
    value: safeNumber(payload.value ?? payload.total_value),
    transaction_id: payload.order_id || payload.transaction_id,
    payment_type: payload.payment_method,
    search_term: payload.search_term,
    method: payload.method,
    items: items.length ? items : undefined,
  })
}

function metaParams(payload = {}) {
  const items = (payload.items || []).map(normalizeItem)
  return cleanPayload({
    currency: payload.currency || config.currency,
    value: safeNumber(payload.value ?? payload.total_value),
    content_ids: items.map(item => item.item_id).filter(Boolean),
    content_name: payload.product_name || items[0]?.item_name,
    content_type: items.length > 1 ? 'product_group' : 'product',
    contents: items.map(item => ({
      id: item.item_id,
      quantity: item.quantity,
      item_price: item.price,
    })),
    search_string: payload.search_term,
    status: payload.status,
  })
}

function gaEventName(name) {
  return name
}

function metaEventName(name) {
  return {
    page_view: 'PageView',
    view_item: 'ViewContent',
    add_to_cart: 'AddToCart',
    remove_from_cart: 'RemoveFromCart',
    begin_checkout: 'InitiateCheckout',
    add_payment_info: 'AddPaymentInfo',
    purchase: 'Purchase',
    login: 'Login',
    sign_up: 'CompleteRegistration',
    search: 'Search',
    view_cart: 'ViewCart',
    navigation_click: 'NavigationClick',
  }[name] || name
}

function isMetaStandardEvent(eventName) {
  return new Set([
    'PageView',
    'ViewContent',
    'AddToCart',
    'InitiateCheckout',
    'AddPaymentInfo',
    'Purchase',
    'CompleteRegistration',
    'Search',
  ]).has(eventName)
}

function loadScript(src, id) {
  if (document.getElementById(id)) return
  const script = document.createElement('script')
  script.id = id
  script.async = true
  script.src = src
  script.onerror = () => debugLog('script_load_failed', { src })
  document.head.appendChild(script)
}

function initGA4() {
  if (!isConfigured(config.ga4MeasurementId) || state.gaLoaded) return
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', config.ga4MeasurementId, {
    send_page_view: false,
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.ga4MeasurementId)}`, 'gb-ga4-loader')
  state.gaLoaded = true
}

function initMeta() {
  if (!isConfigured(config.metaPixelId) || state.metaLoaded) return
  window.fbq = window.fbq || function fbq(){
    window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments)
  }
  window.fbq.push = window.fbq
  window.fbq.loaded = true
  window.fbq.version = '2.0'
  window.fbq.queue = window.fbq.queue || []
  window.fbq('init', config.metaPixelId)
  loadScript('https://connect.facebook.net/en_US/fbevents.js', 'gb-meta-pixel-loader')
  state.metaLoaded = true
}

export function initAnalytics() {
  if (state.initialized) return
  state.initialized = true
  initGA4()
  initMeta()
  trackPageView()
}

export function trackEvent(name, payload = {}, options = {}) {
  try {
    const key = options.onceKey || null
    if (key && state.eventKeys.has(`${name}:${key}`)) return
    if (key) state.eventKeys.add(`${name}:${key}`)

    const gaPayload = gaParams(payload)
    const metaPayload = metaParams(payload)

    debugLog(name, { payload, gaPayload, metaPayload })

    if (window.gtag && state.gaLoaded) {
      window.gtag('event', gaEventName(name), gaPayload)
    }
    if (window.fbq && state.metaLoaded) {
      const metaName = metaEventName(name)
      window.fbq(isMetaStandardEvent(metaName) ? 'track' : 'trackCustom', metaName, metaPayload)
    }
  } catch (error) {
    debugLog('event_error', { name, error: error?.message || String(error) })
  }
}

export function trackPageView(url = window.location.href) {
  const payload = {
    page_title: document.title,
    page_location: url,
    page_path: window.location.pathname,
  }
  debugLog('page_view', payload)
  if (window.gtag && state.gaLoaded) {
    window.gtag('event', 'page_view', payload)
  }
  if (window.fbq && state.metaLoaded) {
    window.fbq('track', 'PageView')
  }
}

export function itemPayload(product, quantity = 1) {
  const item = normalizeItem({ ...product, quantity })
  return {
    currency: config.currency,
    value: item.price * item.quantity,
    items: [item],
  }
}

export function cartPayload(cart = []) {
  const items = cart.map(normalizeItem)
  return {
    currency: config.currency,
    value: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    items,
  }
}

export function purchasePayload(order = {}, cart = []) {
  const cartData = cartPayload(cart)
  return {
    ...cartData,
    order_id: order.order_id || order.id || order.numero,
    transaction_id: order.order_id || order.id || order.numero,
    payment_method: order.payment_method || order.metodo_pago,
    value: safeNumber(order.total ?? order.value ?? cartData.value),
  }
}

initAnalytics()
