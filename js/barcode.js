// HID USB barcode scanner — emulates keyboard input.
// Detects rapid keypress sequences (<100 ms apart, ends with Enter)
// and dispatches a custom 'barcode:scan' event with { detail: { code } }.
//
// Also provides barcode generation (Code128 via JsBarcode CDN)
// and label printing via browser print API.

const SCAN_THRESHOLD_MS = 100
const MIN_BARCODE_LEN   = 4

let _buffer  = ''
let _lastKey = 0

function _onKeydown(e) {
  const now = Date.now()

  if (e.key === 'Enter') {
    if (_buffer.length >= MIN_BARCODE_LEN && (now - _lastKey) < SCAN_THRESHOLD_MS * 2) {
      const code = _buffer
      _buffer = ''
      _lastKey = 0
      document.dispatchEvent(new CustomEvent('barcode:scan', { detail: { code }, bubbles: true }))
    } else {
      _buffer = ''
    }
    return
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (_buffer.length > 0 && (now - _lastKey) > SCAN_THRESHOLD_MS) {
      // Gap too long — this was a normal keystroke, not scanner
      _buffer = ''
    }
    _buffer  += e.key
    _lastKey  = now
  }
}

let _listening = false

export function startBarcodeListener() {
  if (_listening) return
  document.addEventListener('keydown', _onKeydown)
  _listening = true
}

export function stopBarcodeListener() {
  document.removeEventListener('keydown', _onKeydown)
  _listening = false
  _buffer = ''
  _lastKey = 0
}

// ── Barcode generation ───────────────────────────────────────────

let _jsBarcodePromise = null

function loadJsBarcode() {
  if (_jsBarcodePromise) return _jsBarcodePromise
  _jsBarcodePromise = new Promise((resolve, reject) => {
    if (window.JsBarcode) { resolve(window.JsBarcode); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'
    script.onload  = () => resolve(window.JsBarcode)
    script.onerror = () => reject(new Error('Failed to load JsBarcode'))
    document.head.appendChild(script)
  })
  return _jsBarcodePromise
}

/**
 * Renders a Code128 barcode into an <svg> element.
 * @param {SVGElement} svgEl - Target SVG element
 * @param {string} value - Barcode value (SKU, order number, etc.)
 * @param {{ width?: number, height?: number, displayValue?: boolean }} [opts]
 */
export async function renderBarcode(svgEl, value, opts = {}) {
  const JsBarcode = await loadJsBarcode()
  JsBarcode(svgEl, value, {
    format:       'CODE128',
    width:        opts.width        ?? 2,
    height:       opts.height       ?? 60,
    displayValue: opts.displayValue ?? true,
    fontSize:     12,
    margin:       8,
    lineColor:    '#000',
    background:   '#fff',
  })
}

// ── Label printing ───────────────────────────────────────────────

/**
 * Prints a product label with barcode.
 * @param {{ sku: string, nombre: string, precio: number }} product
 */
export async function printLabel(product) {
  const win = window.open('', '_blank', 'width=400,height=300')
  if (!win) { alert('Habilitá las ventanas emergentes para imprimir.'); return }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Etiqueta — ${product.nombre}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; width: 62mm; padding: 4mm; }
    .brand { font-size: 8pt; text-align: center; letter-spacing: 3px; margin-bottom: 2mm; }
    .name  { font-size: 7pt; text-align: center; margin-bottom: 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sku   { font-size: 6pt; text-align: center; color: #555; margin-bottom: 1mm; }
    svg    { display: block; margin: 0 auto; }
    .price { font-size: 11pt; font-weight: bold; text-align: center; margin-top: 1mm; }
    @media print { @page { margin: 0; size: 62mm 30mm; } }
  </style>
</head>
<body>
  <div class="brand">GLOW BOXES</div>
  <div class="name">${product.nombre}</div>
  <div class="sku">SKU: ${product.sku || '—'}</div>
  <svg id="bc"></svg>
  <div class="price">$${Number(product.precio).toLocaleString('es-AR')}</div>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script>
    window.onload = function() {
      try {
        JsBarcode('#bc', '${(product.sku || product.nombre).replace(/'/g, "\\'")}', {
          format:'CODE128', width:1.5, height:32, displayValue:false, margin:2
        })
      } catch(e) {}
      setTimeout(() => { window.print(); window.close() }, 300)
    }
  <\/script>
</body>
</html>`)
  win.document.close()
}
