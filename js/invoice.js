// ── Glow Boxes Invoice & Boleta ────────────────────────────
// Generates downloadable PDFs and printable receipts for orders.
// Used by both admin panel and cliente dashboard.

import {
  getJsPDF, C, fmtP, fmtD, fmtDT, safe, loadLogo,
  pageHeader, pageFooter, sectionTitle, infoBox, totalsBlock, tableDefaults,
} from './pdf.js'

// ── Label maps ───────────────────────────────────────────────
const ESTADO  = { pendiente:'Pendiente', confirmado:'Confirmado', en_preparacion:'En preparación', en_transito:'En tránsito', enviado:'Enviado', entregado:'Entregado', completado:'Completado', cancelado:'Cancelado' }
const PAGO    = { pendiente:'Pendiente', acreditado:'Acreditado', pagado:'Pagado', rechazado:'Rechazado', reembolsado:'Reembolsado' }
const METODO  = { transferencia:'Transferencia bancaria', mercado_pago:'Mercado Pago', efectivo:'Efectivo', tarjeta:'Tarjeta', otro:'Otro' }
const ENVIO   = { pickup:'Retiro en local', own:'Envío a domicilio', correo:'Correo argentino', moto:'Moto mensajería' }

// ── Helpers ───────────────────────────────────────────────────
function orderNum(order) {
  return order.numero
    ? `GB-${order.numero}`
    : String(order.id || '').slice(0, 8).toUpperCase()
}

function orderAddress(order) {
  const d = order.direccion_envio
  if (!d) return 'Sin dirección'
  if (typeof d === 'string') return d
  return d.texto || d.direccion || d.calle || JSON.stringify(d)
}

function itemsTable(order) {
  return (order.pedido_items || []).map((item, i) => {
    const prod = item.productos
    const nombre = prod?.nombre || item.nombre_producto || 'Producto'
    const sku    = prod?.sku    || item.sku || '—'
    const qty    = item.cantidad || 1
    const unit   = item.precio_unitario
    const sub    = item.subtotal ?? qty * unit
    return [String(i + 1), safe(nombre), safe(sku), String(qty), fmtP(unit), fmtP(sub)]
  })
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Status chip row ───────────────────────────────────────────
function statusChips(doc, order, y) {
  const W = doc.internal.pageSize.getWidth()
  const chips = [
    { label: 'ESTADO',  value: (ESTADO[order.estado]   || order.estado   || '—').toUpperCase() },
    { label: 'PAGO',    value: (PAGO[order.pago_estado] || order.pago_estado || '—').toUpperCase() },
    { label: 'MÉTODO',  value: (METODO[order.pago_metodo || order.metodo_pago] || '—').toUpperCase() },
  ]
  const chipW = 58
  chips.forEach((chip, i) => {
    const cx = 12 + i * (chipW + 4)
    doc.setFillColor(...C.darkRow)
    doc.roundedRect(cx, y, chipW, 9, 1, 1, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.headerSub)
    doc.text(chip.label + ':', cx + 3, y + 5.5)
    const labelW = doc.getTextWidth(chip.label + ':') + 1
    doc.setTextColor(...C.white)
    const maxW = chipW - labelW - 6
    const txt  = doc.splitTextToSize(chip.value, maxW)[0] || ''
    doc.text(txt, cx + 3 + labelW, y + 5.5)
  })
  return y + 14
}

// ─────────────────────────────────────────────────────────────
// 1. FULL ORDER PDF (admin view)
// ─────────────────────────────────────────────────────────────
export async function downloadOrderPDF(order, client = {}) {
  const jsPDF  = getJsPDF()
  const logo   = await loadLogo()
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const W      = doc.internal.pageSize.getWidth()
  const num    = orderNum(order)
  const name   = client.name  || order.cliente_nombre || 'Cliente'
  const email  = client.email || order.cliente_email  || '—'

  let y = pageHeader(doc, 'ORDEN DE PEDIDO', `${num}  ·  ${fmtDT(order.created_at)}`, logo)
  y = statusChips(doc, order, y)

  // Customer
  y = sectionTitle(doc, '// Cliente', y)
  y = infoBox(doc, [
    ['Nombre',     name],
    ['Email',      email],
    ['Dirección',  orderAddress(order)],
    ['Envío',      ENVIO[order.metodo_envio] || order.metodo_envio || '—'],
  ], y, { valX: 56 })

  // Products table
  y = sectionTitle(doc, '// Productos', y)
  doc.autoTable({
    ...tableDefaults,
    startY: y,
    head: [['#', 'Producto', 'SKU', 'Cant.', 'P.Unit.', 'Subtotal']],
    body: itemsTable(order),
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28 },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
  })
  y = doc.lastAutoTable.finalY + 5

  // Totals
  const totRows = [
    { label: 'Subtotal',      value: order.subtotal },
    ...(Number(order.descuento) > 0 ? [{ label: 'Descuento', raw: `−${fmtP(order.descuento)}` }] : []),
    { label: 'Costo de envío', value: order.costo_envio },
    { label: 'TOTAL',          value: order.total, highlight: true },
  ]
  y = totalsBlock(doc, totRows, y)
  y += 3

  // Extra info
  const extras = []
  if (order.numero_seguimiento || order.tracking_code)
    extras.push(['N° Seguimiento', order.numero_seguimiento || order.tracking_code])
  if (order.notas)
    extras.push(['Notas', order.notas])
  if (order.comprobante_filename)
    extras.push(['Comprobante', order.comprobante_filename])

  if (extras.length) {
    y = sectionTitle(doc, '// Info adicional', y)
    y = infoBox(doc, extras, y, { valX: 60 })
  }

  // Footers
  const total = doc.internal.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    pageFooter(doc, p, total, `Generado: ${fmtDT(new Date())}`)
  }

  doc.save(`GlowBoxes_Pedido_${num}.pdf`)
}

// ─────────────────────────────────────────────────────────────
// 2. BOLETA / CUSTOMER RECEIPT PDF
// ─────────────────────────────────────────────────────────────
export async function downloadBoleta(order, client = {}) {
  const jsPDF  = getJsPDF()
  const logo   = await loadLogo()
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const W      = doc.internal.pageSize.getWidth()
  const num    = orderNum(order)
  const name   = client.name  || order.cliente_nombre || 'Cliente'
  const email  = client.email || order.cliente_email  || '—'

  let y = pageHeader(doc, 'COMPROBANTE DE COMPRA', `Generado: ${fmtDT(new Date())}`, logo)

  // Order number hero card
  doc.setFillColor(...C.rowAlt)
  doc.roundedRect(12, y, W - 24, 18, 2, 2, 'F')
  doc.setDrawColor(...C.violet)
  doc.setLineWidth(0.5)
  doc.roundedRect(12, y, W - 24, 18, 2, 2, 'S')

  // Left: order number
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.mutedText)
  doc.text('COMPROBANTE N°', 18, y + 6)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...C.violet)
  doc.text(num, 18, y + 14)

  // Centre: date
  const cx = W / 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.mutedText)
  doc.text('FECHA', cx, y + 6, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.bodyText)
  doc.text(fmtD(order.created_at), cx, y + 14, { align: 'center' })

  // Right: estado
  const rx = W - 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.mutedText)
  doc.text('ESTADO', rx, y + 6, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.bodyText)
  doc.text((ESTADO[order.estado] || order.estado || '—').toUpperCase(), rx, y + 14, { align: 'right' })

  y += 24

  // Customer
  y = sectionTitle(doc, '// Datos del cliente', y)
  y = infoBox(doc, [
    ['Cliente',    name],
    ['Email',      email],
    ['Dirección',  orderAddress(order)],
  ], y, { valX: 60 })

  // Products
  y = sectionTitle(doc, '// Detalle de la compra', y)
  doc.autoTable({
    ...tableDefaults,
    startY: y,
    head: [['Producto', 'Cant.', 'P.Unit.', 'Subtotal']],
    body: (order.pedido_items || []).map(item => {
      const nombre = item.productos?.nombre || item.nombre_producto || 'Producto'
      const qty    = item.cantidad || 1
      const sub    = item.subtotal ?? qty * item.precio_unitario
      return [safe(nombre), String(qty), fmtP(item.precio_unitario), fmtP(sub)]
    }),
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
  })
  y = doc.lastAutoTable.finalY + 5

  // Totals
  const totRows = [
    { label: 'Subtotal',       value: order.subtotal },
    ...(Number(order.descuento) > 0 ? [{ label: 'Descuento', raw: `−${fmtP(order.descuento)}` }] : []),
    { label: 'Costo de envío', value: order.costo_envio },
    { label: 'TOTAL',          value: order.total, highlight: true },
  ]
  y = totalsBlock(doc, totRows, y)
  y += 5

  // Payment info
  y = sectionTitle(doc, '// Información de pago', y)
  y = infoBox(doc, [
    ['Método de pago',  METODO[order.pago_metodo || order.metodo_pago] || order.pago_metodo || '—'],
    ['Estado de pago',  PAGO[order.pago_estado]   || order.pago_estado || '—'],
    ['Forma de envío',  ENVIO[order.metodo_envio]  || order.metodo_envio || '—'],
    ...(order.numero_seguimiento ? [['N° Seguimiento', order.numero_seguimiento]] : []),
  ], y, { valX: 65 })

  // Thank-you block
  y += 2
  doc.setFillColor(248, 246, 255)
  doc.roundedRect(12, y, W - 24, 18, 2, 2, 'F')
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(12, y, W - 24, 18, 2, 2, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.violet)
  doc.text('¡Gracias por tu compra en Glow Boxes!', W / 2, y + 8, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.mutedText)
  doc.text('Guardá este comprobante para cualquier consulta. glowboxes.com.ar', W / 2, y + 14, { align: 'center' })

  const total = doc.internal.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    pageFooter(doc, p, total, `Comprobante ${num}`)
  }

  doc.save(`GlowBoxes_Boleta_${num}.pdf`)
}

// ─────────────────────────────────────────────────────────────
// 3. PRINT — opens a styled print window (no PDF library needed)
// ─────────────────────────────────────────────────────────────
export function printReceipt(order, client = {}) {
  const num    = orderNum(order)
  const name   = client.name  || order.cliente_nombre || 'Cliente'
  const email  = client.email || order.cliente_email  || '—'
  const items  = order.pedido_items || []
  const fmtM   = n => `$${Number(n || 0).toLocaleString('es-AR')}`

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1a1a26;background:#fff;padding:16px}
    .hdr{background:#08080e;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .hdr-brand{font-weight:900;font-size:15px;letter-spacing:.1em}
    .hdr-sub{font-size:7px;color:#8c6ec8;letter-spacing:.12em;margin-top:2px}
    .hdr-r{text-align:right}
    .hdr-type{font-size:8px;color:#8c6ec8;letter-spacing:.1em;text-transform:uppercase}
    .hdr-num{font-size:13px;font-weight:900;color:#a86bff;margin-top:2px}
    .sec{margin-bottom:14px}
    .sec-title{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#a86bff;border-bottom:2px solid #a86bff;padding-bottom:3px;margin-bottom:8px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px;background:#f9f8fd;border:1px solid #ded8e8;padding:10px;border-radius:3px}
    .fi .lbl{font-size:7px;text-transform:uppercase;letter-spacing:.1em;color:#6e6e82;margin-bottom:2px}
    .fi .val{font-size:11px;font-weight:700;color:#1a1a26}
    .fi.full{grid-column:1/-1}
    table{width:100%;border-collapse:collapse}
    th{background:#08080e;color:#fff;padding:5px 7px;font-size:8px;text-transform:uppercase;letter-spacing:.08em;text-align:left}
    td{padding:5px 7px;border-bottom:1px solid #e5e3f0;font-size:11px}
    tr:nth-child(even) td{background:#f9f8fd}
    .r{text-align:right}.c{text-align:center}
    .totals-tbl{float:right;width:200px;border-collapse:collapse}
    .totals-tbl td{border:none;padding:3px 7px;font-size:11px}
    .totals-tbl .ttl td{background:#08080e;color:#fff;font-weight:900;font-size:12px}
    .totals-tbl .ttl .tval{color:#b4e632}
    .thanks{background:#f9f8fd;border:1px solid #ded8e8;padding:10px;text-align:center;margin-top:14px;border-radius:3px}
    .thanks strong{color:#a86bff;font-size:11px}
    .thanks p{font-size:8px;color:#6e6e82;margin-top:3px}
    .foot{margin-top:14px;text-align:center;font-size:7.5px;color:#9090a8;border-top:1px solid #e5e3f0;padding-top:7px}
    @media print{
      .hdr,.totals-tbl .ttl{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }`

  const itemRows = items.map(item => {
    const nombre = esc(item.productos?.nombre || item.nombre_producto || 'Producto')
    const qty    = item.cantidad || 1
    const sub    = item.subtotal ?? qty * item.precio_unitario
    return `<tr><td>${nombre}</td><td class="c">${qty}</td><td class="r">${fmtM(item.precio_unitario)}</td><td class="r"><strong>${fmtM(sub)}</strong></td></tr>`
  }).join('')

  const discountRow = Number(order.descuento) > 0
    ? `<tr><td>Descuento</td><td class="r">−${fmtM(order.descuento)}</td></tr>` : ''

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Boleta ${esc(num)}</title>
<style>${css}</style>
</head><body>
<div class="hdr">
  <div><div class="hdr-brand">GLOW BOXES</div><div class="hdr-sub">ESTÉTICA VEHICULAR · ALTO RENDIMIENTO</div></div>
  <div class="hdr-r"><div class="hdr-type">COMPROBANTE DE COMPRA</div><div class="hdr-num">${esc(num)}</div></div>
</div>

<div class="sec">
  <div class="sec-title">// Datos del cliente</div>
  <div class="grid2">
    <div class="fi"><div class="lbl">Cliente</div><div class="val">${esc(name)}</div></div>
    <div class="fi"><div class="lbl">Email</div><div class="val">${esc(email)}</div></div>
    <div class="fi full"><div class="lbl">Dirección</div><div class="val">${esc(orderAddress(order))}</div></div>
  </div>
</div>

<div class="sec">
  <div class="sec-title">// Detalle de la compra</div>
  <table><tr><th>Producto</th><th class="c">Cant.</th><th class="r">P. Unit.</th><th class="r">Subtotal</th></tr>${itemRows}</table>
  <div style="overflow:hidden;margin-top:6px">
    <table class="totals-tbl">
      <tr><td>Subtotal</td><td class="r">${fmtM(order.subtotal)}</td></tr>
      ${discountRow}
      <tr><td>Envío</td><td class="r">${fmtM(order.costo_envio)}</td></tr>
      <tr class="ttl"><td>TOTAL</td><td class="r tval">${fmtM(order.total)}</td></tr>
    </table>
    <div style="clear:both"></div>
  </div>
</div>

<div class="sec">
  <div class="sec-title">// Información de pago</div>
  <div class="grid2">
    <div class="fi"><div class="lbl">Método de pago</div><div class="val">${esc(METODO[order.pago_metodo||order.metodo_pago]||order.pago_metodo||'—')}</div></div>
    <div class="fi"><div class="lbl">Estado de pago</div><div class="val">${esc(PAGO[order.pago_estado]||order.pago_estado||'—')}</div></div>
    <div class="fi"><div class="lbl">Forma de envío</div><div class="val">${esc(ENVIO[order.metodo_envio]||order.metodo_envio||'—')}</div></div>
    ${order.numero_seguimiento ? `<div class="fi"><div class="lbl">N° Seguimiento</div><div class="val">${esc(order.numero_seguimiento)}</div></div>` : ''}
  </div>
</div>

<div class="thanks">
  <strong>¡Gracias por tu compra en Glow Boxes!</strong>
  <p>Guardá este comprobante para cualquier consulta sobre tu pedido.</p>
</div>

<div class="foot">GLOW BOXES · glowboxes.com.ar · Generado el ${new Date().toLocaleString('es-AR')} · Comprobante N° ${esc(num)}</div>

<script>window.onload = () => { window.focus(); window.print(); }</script>
</body></html>`

  const w = window.open('', '_blank', 'width=760,height=960,scrollbars=yes')
  if (!w) { alert('Permitir popups para imprimir.'); return }
  w.document.write(html)
  w.document.close()
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
