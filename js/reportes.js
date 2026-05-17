// ── Glow Boxes Sales Report PDF ────────────────────────────
// Generates a multi-page PDF report from real Supabase state data.

import {
  getJsPDF, C, fmtP, fmtD, fmtDT, safe, loadLogo,
  pageHeader, pageFooter, sectionTitle, tableDefaults, sumF,
} from './pdf.js'

const ESTADO  = { pendiente:'Pendiente', confirmado:'Confirmado', en_preparacion:'En prep.', en_transito:'En tránsito', enviado:'Enviado', entregado:'Entregado', completado:'Completado', cancelado:'Cancelado' }
const METODO  = { transferencia:'Transferencia', mercado_pago:'Mercado Pago', efectivo:'Efectivo', tarjeta:'Tarjeta', otro:'Otro' }

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────
export async function downloadReportePDF(state) {
  const jsPDF  = await getJsPDF()
  const logo   = await loadLogo()
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const W      = doc.internal.pageSize.getWidth()
  const now    = new Date()

  const pedidos      = state.pedidos     || []
  const pedidoItems  = state.pedidoItems || []
  const clientes     = state.clientes    || []
  const productos    = state.productos   || []

  // ── Derived metrics ──────────────────────────────────────
  const active     = pedidos.filter(o => !['cancelado','rechazado'].includes(o.estado) && o.pago_estado !== 'rechazado')
  const revenue    = sumF(active, 'total')
  const avgTicket  = active.length ? revenue / active.length : 0
  const pending    = pedidos.filter(o => o.estado === 'pendiente').length
  const cancelled  = pedidos.filter(o => o.estado === 'cancelado').length
  const completed  = pedidos.filter(o => ['completado','entregado'].includes(o.estado)).length
  const totalDisc  = sumF(active, 'descuento')

  // ── PAGE 1: Summary ──────────────────────────────────────
  let y = pageHeader(doc, 'REPORTE DE VENTAS', `Generado: ${fmtDT(now)}`, logo)

  // KPI cards (4-up grid)
  const kpis = [
    { lbl: 'INGRESOS BRUTOS', val: fmtP(revenue),         sub: `${active.length} pedidos activos` },
    { lbl: 'TICKET PROMEDIO',  val: fmtP(avgTicket),       sub: `${completed} completados` },
    { lbl: 'PEDIDOS TOTALES',  val: String(pedidos.length), sub: `${pending} pendientes` },
    { lbl: 'DESCUENTOS',       val: fmtP(totalDisc),       sub: `${cancelled} cancelados` },
  ]
  const kw = (W - 24 - 9) / 4
  kpis.forEach((k, i) => {
    const kx = 12 + i * (kw + 3)
    doc.setFillColor(...C.darkRow)
    doc.rect(kx, y, kw, 22, 'F')
    // top accent
    doc.setFillColor(...C.violet)
    doc.rect(kx, y, kw, 1.2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.headerSub)
    doc.text(k.lbl, kx + 3, y + 7)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(i === 0 ? 10 : 12)
    doc.setTextColor(...C.white)
    doc.text(k.val, kx + 3, y + 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(90, 90, 110)
    doc.text(k.sub, kx + 3, y + 20)
  })
  y += 28

  // Payment methods (left half)
  const payMap = new Map()
  for (const o of pedidos) {
    const m = o.pago_metodo || o.metodo_pago || 'otro'
    payMap.set(m, (payMap.get(m) || 0) + Number(o.total || 0))
  }
  const payTotal = [...payMap.values()].reduce((s,v) => s + v, 1)
  const payRows  = [...payMap.entries()]
    .sort((a,b) => b[1] - a[1])
    .map(([k,v]) => [METODO[k] || k, fmtP(v), `${((v/payTotal)*100).toFixed(1)}%`])

  const leftMargin  = 12
  const halfWidth   = (W - 28) / 2

  y = sectionTitle(doc, '// Métodos de pago', y)
  const payY = y
  doc.autoTable({
    ...tableDefaults,
    startY: y,
    head: [['Método', 'Total', '%']],
    body: payRows,
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: 18, halign: 'right' },
    },
    margin: { left: leftMargin, right: W / 2 + 5 },
  })

  // Top products (right half, same startY)
  const prodMap = new Map()
  for (const item of pedidoItems) {
    const name = item.produtos?.nombre || item.productos?.nombre || item.nombre_producto || 'Producto'
    const cur  = prodMap.get(name) || { qty: 0, rev: 0 }
    prodMap.set(name, { qty: cur.qty + Number(item.cantidad || 1), rev: cur.rev + Number(item.subtotal || 0) })
  }
  const topProds = [...prodMap.entries()]
    .sort((a,b) => b[1].rev - a[1].rev)
    .slice(0, 10)
    .map(([name, d], i) => [String(i+1), safe(name.slice(0,28)), String(d.qty), fmtP(d.rev)])

  doc.autoTable({
    ...tableDefaults,
    startY: payY,
    head: [['#', 'Producto', 'Unid.', 'Ingresos']],
    body: topProds.length ? topProds : [['—', 'Sin datos', '—', '—']],
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: W / 2 + 5, right: leftMargin },
  })
  y = Math.max(doc.lastAutoTable.finalY, doc.previousAutoTable?.finalY ?? 0) + 6

  // Top clients
  const clientMap = new Map()
  for (const o of active) {
    const cid  = o.user_id || o.cliente_email || 'anon'
    const name = o.cliente_nombre || clientes.find(c => c.id === o.user_id)?.nombre || 'Cliente'
    const cur  = clientMap.get(cid) || { name, count: 0, total: 0 }
    clientMap.set(cid, { name: cur.name, count: cur.count + 1, total: cur.total + Number(o.total || 0) })
  }
  const topClients = [...clientMap.values()]
    .sort((a,b) => b.total - a.total)
    .slice(0, 8)
    .map((c, i) => [String(i+1), safe(c.name), String(c.count), fmtP(c.total)])

  y = sectionTitle(doc, '// Top clientes', y)
  doc.autoTable({
    ...tableDefaults,
    startY: y,
    head: [['#', 'Cliente', 'Pedidos', 'Total']],
    body: topClients.length ? topClients : [['—', 'Sin datos', '—', '—']],
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
  })
  y = doc.lastAutoTable.finalY + 6

  // ── PAGE 2: Full order list ──────────────────────────────
  doc.addPage()
  y = pageHeader(doc, 'LISTADO DE PEDIDOS', `${pedidos.length} pedidos en total`, logo)

  y = sectionTitle(doc, '// Todos los pedidos', y)

  const orderRows = [...pedidos]
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .map(o => {
      const num   = o.numero ? `GB-${o.numero}` : String(o.id||'').slice(0,8).toUpperCase()
      const cname = o.cliente_nombre || clientes.find(c => c.id === o.user_id)?.nombre || '—'
      const est   = ESTADO[o.estado] || o.estado || '—'
      return [safe(num), fmtD(o.created_at), safe(cname), fmtP(o.total), safe(est)]
    })

  doc.autoTable({
    ...tableDefaults,
    startY: y,
    head: [['N° Pedido', 'Fecha', 'Cliente', 'Total', 'Estado']],
    body: orderRows.length ? orderRows : [['—','—','—','—','—']],
    styles: { ...tableDefaults.styles, fontSize: 7.5, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 22 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 28 },
    },
  })

  // ── PAGE 3: Stock snapshot (if products available) ───────
  if (productos.length) {
    doc.addPage()
    y = pageHeader(doc, 'INVENTARIO', `${productos.length} productos`, logo)
    y = sectionTitle(doc, '// Stock actual', y)

    const stockRows = [...productos]
      .sort((a,b) => (a.stock || 0) - (b.stock || 0))
      .map(p => [
        safe(p.nombre || '—'),
        safe(p.sku || '—'),
        String(p.stock ?? '—'),
        fmtP(p.precio),
        p.stock <= 0 ? 'AGOTADO' : p.stock <= (p.stock_minimo || 5) ? 'CRÍTICO' : 'OK',
      ])

    doc.autoTable({
      ...tableDefaults,
      startY: y,
      head: [['Producto', 'SKU', 'Stock', 'Precio', 'Estado']],
      body: stockRows,
      styles: { ...tableDefaults.styles, fontSize: 7.5, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 30 },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      },
      willDrawCell: data => {
        if (data.section === 'body' && data.column.index === 4) {
          const v = data.cell.raw
          if (v === 'AGOTADO') doc.setTextColor(200, 50, 60)
          else if (v === 'CRÍTICO') doc.setTextColor(220, 140, 30)
          else doc.setTextColor(50, 160, 80)
        }
      },
    })
  }

  // ── Footers on all pages ─────────────────────────────────
  const totalPgs = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPgs; p++) {
    doc.setPage(p)
    pageFooter(doc, p, totalPgs, `Generado: ${fmtDT(now)}`)
  }

  const dateStr = now.toISOString().slice(0, 10)
  doc.save(`GlowBoxes_Reporte_${dateStr}.pdf`)
}
