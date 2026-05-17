// ── Glow Boxes PDF Core ────────────────────────────────────
// Shared branding, helpers, and page builders for all PDF exports.
// Requires jsPDF + jsPDF-AutoTable loaded via CDN <script> tags.

export function getJsPDF() {
  const ctor = window.jspdf?.jsPDF
  if (!ctor) throw new Error('jsPDF no cargado. Recargá la página e intentá de nuevo.')
  return ctor
}

// Brand palette for PDFs (RGB tuples)
export const C = {
  headerBg:  [8,  8, 14],
  headerSub: [140, 110, 200],
  violet:    [168, 107, 255],
  acid:      [180, 230,  50],
  bodyText:  [ 20,  20,  35],
  mutedText: [110, 110, 130],
  rowAlt:    [249, 248, 253],
  border:    [222, 220, 232],
  white:     [255, 255, 255],
  darkRow:   [ 22,  22,  30],
}

// ── Formatters ──────────────────────────────────────────────
export const fmtP   = n  => `$${Number(n || 0).toLocaleString('es-AR')}`
export const fmtD   = v  => v ? new Date(v).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
export const fmtDT  = v  => v ? new Date(v).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
export const safe   = v  => String(v ?? '—').replace(/[\x00-\x09\x0b-\x1f]/g, '')
export const sumF   = (arr, f) => arr.reduce((s, x) => s + Number(x[f] || 0), 0)

// ── Logo loader ─────────────────────────────────────────────
export async function loadLogo() {
  try {
    const resp = await fetch('/img/logo.png')
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise((res, rej) => {
      const fr = new FileReader()
      fr.onload  = () => res(fr.result)
      fr.onerror = rej
      fr.readAsDataURL(blob)
    })
  } catch { return null }
}

// ── Page header ─────────────────────────────────────────────
// Returns the y position right below the header.
export function pageHeader(doc, title, subtitle, logoB64) {
  const W = doc.internal.pageSize.getWidth()

  // Dark header band
  doc.setFillColor(...C.headerBg)
  doc.rect(0, 0, W, 30, 'F')

  // Violet accent stripe
  doc.setFillColor(...C.violet)
  doc.rect(0, 30, W, 1.2, 'F')

  // Logo image (if loaded)
  if (logoB64) {
    try { doc.addImage(logoB64, 'PNG', 12, 4, 22, 22) } catch { /* ignore if image fails */ }
    // Brand text next to logo
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...C.white)
    doc.text('GLOW BOXES', 37, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.headerSub)
    doc.text('ESTÉTICA VEHICULAR · ALTO RENDIMIENTO', 37, 20)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...C.white)
    doc.text('GLOW BOXES', 14, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...C.headerSub)
    doc.text('ESTÉTICA VEHICULAR · ALTO RENDIMIENTO', 14, 20)
  }

  // Right side — document title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...C.white)
  doc.text(title.toUpperCase(), W - 12, 14, { align: 'right' })

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.headerSub)
    doc.text(subtitle, W - 12, 21, { align: 'right' })
  }

  return 36
}

// ── Page footer (call once per page) ────────────────────────
export function pageFooter(doc, pg, total, note) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.25)
  doc.line(12, H - 13, W - 12, H - 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C.mutedText)
  const left = `GLOW BOXES · glowboxes.com.ar${note ? '  ·  ' + note : ''}`
  doc.text(left, 12, H - 7)
  doc.text(`${pg} / ${total}`, W - 12, H - 7, { align: 'right' })
}

// ── Section title bar ────────────────────────────────────────
// Returns y after the title.
export function sectionTitle(doc, text, y) {
  doc.setFillColor(...C.violet)
  doc.rect(12, y, 2.5, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.violet)
  doc.text(text.toUpperCase(), 18, y + 4.5)
  return y + 10
}

// ── Info box (key-value grid on light background) ────────────
// rows: Array of [label, value] pairs.
// Returns y after the box.
export function infoBox(doc, rows, y, opts = {}) {
  const W    = doc.internal.pageSize.getWidth()
  const lx   = opts.x        ?? 12
  const bw   = opts.w        ?? W - 24
  const valX = opts.valX     ?? lx + 44
  const bh   = rows.length * 5.5 + 7

  doc.setFillColor(...C.rowAlt)
  doc.rect(lx, y, bw, bh, 'F')
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.rect(lx, y, bw, bh, 'S')

  let ry = y + 6
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.mutedText)
    doc.text(String(label), lx + 4, ry)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.bodyText)
    // Truncate long values to avoid overflow
    const maxW = bw - (valX - lx) - 6
    const txt  = doc.splitTextToSize(safe(value), maxW)[0] || ''
    doc.text(txt, valX, ry)
    ry += 5.5
  }
  return y + bh + 4
}

// ── Totals block (right-aligned) ─────────────────────────────
// rows: [{label, value, bold, highlight}]
// Returns y after block.
export function totalsBlock(doc, rows, y) {
  const W = doc.internal.pageSize.getWidth()
  const bx = W - 12 - 70

  for (const row of rows) {
    if (row.highlight) {
      doc.setFillColor(...C.headerBg)
      doc.rect(bx, y - 4, 70, 8.5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...C.headerSub)
      doc.text(row.label, bx + 3, y + 1)
      doc.setTextColor(...C.acid)
      doc.text(fmtP(row.value), W - 14, y + 1, { align: 'right' })
    } else {
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...C.mutedText)
      doc.text(row.label, bx + 3, y)
      doc.setTextColor(...C.bodyText)
      doc.text(row.value != null ? fmtP(row.value) : row.raw ?? '—', W - 14, y, { align: 'right' })
    }
    y += row.highlight ? 6 : 5.5
  }
  return y
}

// ── autoTable defaults ────────────────────────────────────────
export const tableDefaults = {
  theme: 'grid',
  styles: {
    fontSize: 8,
    cellPadding: 3,
    textColor: C.bodyText,
    lineColor: C.border,
    lineWidth: 0.2,
    overflow: 'ellipsize',
  },
  headStyles: {
    fillColor: C.headerBg,
    textColor: C.white,
    fontStyle: 'bold',
    fontSize: 7.5,
  },
  alternateRowStyles: { fillColor: C.rowAlt },
  margin: { left: 12, right: 12 },
}
