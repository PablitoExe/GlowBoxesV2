import type { EmailType, TemplateResult, OrderData, WelcomeData, OrderItem, ContactData, PasswordRecoveryData, InvoiceData } from './types.ts'

const BASE_URL = 'https://glowboxes.com.ar'

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function money(n: unknown): string {
  const num = Math.round(Number(n) || 0)
  return `$${num.toLocaleString('es-AR')}`
}

function payLabel(raw: string | undefined): string {
  if (!raw) return '—'
  const map: Record<string, string> = {
    mercado_pago: 'Mercado Pago',
    transferencia: 'Transferencia bancaria',
    mp: 'Mercado Pago',
    transfer: 'Transferencia bancaria',
  }
  return map[raw] || raw
}

function shipLabel(raw: string | undefined): string {
  if (!raw) return '—'
  const map: Record<string, string> = {
    pickup: 'Retiro en local',
    own: 'Envío Glow Express',
    correo: 'Correo Argentino',
  }
  return map[raw] || raw
}

function pagoEstadoLabel(raw: string | undefined): string {
  if (!raw) return '—'
  const map: Record<string, string> = {
    pendiente: 'Pago pendiente de acreditación',
    acreditado: 'Pago acreditado ✓',
    pagado: 'Pagado ✓',
    rechazado: 'Pago rechazado',
    reembolsado: 'Reembolsado',
  }
  return map[raw] || raw
}

// ──────────────────────────────────────────────────────────────
// Base layout wrapper
// ──────────────────────────────────────────────────────────────
function baseWrapper(opts: {
  preheader: string
  headerTag: string
  title: string
  content: string
}): string {
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${esc(opts.title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">
    @media only screen and (max-width:620px){
      .em-wrap{padding:16px 8px 32px!important}
      .em-box{border-radius:0!important}
      .em-pad{padding:24px 20px!important}
      .em-pad-h{padding-left:20px!important;padding-right:20px!important}
      .em-col{display:block!important;width:100%!important;padding:0 0 12px!important}
      .em-col-r{display:block!important;width:100%!important;padding:0!important}
      .em-hero-h1{font-size:24px!important}
      .em-feat-cell{display:block!important;width:100%!important;padding:0 0 10px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#05050a;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;word-break:break-word;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(opts.preheader)}&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#05050a">
    <tr>
      <td class="em-wrap" align="center" style="padding:28px 16px 48px;">
        <table role="presentation" class="em-box" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#0d0d1a;border:1px solid #1e1e3a;border-radius:8px;overflow:hidden;">

          <!-- HEADER -->
          <tr>
            <td style="background-color:#08080f;padding:26px 36px;border-bottom:2px solid #5b21b6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-family:'Courier New',Courier,monospace;font-size:20px;font-weight:bold;letter-spacing:0.18em;color:#a78bfa;line-height:1;">&#9670; GLOW BOXES</div>
                    <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#3b2a6e;margin-top:5px;text-transform:uppercase;">// mystery box experience</div>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;">${esc(opts.headerTag)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${opts.content}

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#06060d;padding:24px 36px;border-top:1px solid #12122a;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <p style="margin:0 0 8px;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:0.15em;color:#252542;text-transform:uppercase;">
                      &copy; 2025 Glow Boxes &middot; Argentina
                    </p>
                    <p style="margin:0 0 8px;">
                      <a href="mailto:soporte@glowboxes.com.ar" style="font-family:'Courier New',Courier,monospace;font-size:9px;color:#7c3aed;text-decoration:none;letter-spacing:0.1em;">soporte@glowboxes.com.ar</a>
                      <span style="color:#1a1a30;font-size:9px;">&nbsp;&middot;&nbsp;</span>
                      <a href="${BASE_URL}" style="font-family:'Courier New',Courier,monospace;font-size:9px;color:#7c3aed;text-decoration:none;letter-spacing:0.1em;">glowboxes.com.ar</a>
                    </p>
                    <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:8px;color:#18183a;letter-spacing:0.06em;">
                      // Este es un mensaje autom&aacute;tico. Por favor no respondas este email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ──────────────────────────────────────────────────────────────
// Shared HTML parts
// ──────────────────────────────────────────────────────────────
function accentDivider(): string {
  return `<tr><td class="em-pad-h" style="padding-left:36px;padding-right:36px;"><div style="height:1px;background:linear-gradient(to right,transparent,#7c3aed 40%,#7c3aed 60%,transparent);"></div></td></tr>`
}

function ctaButton(label: string, href: string): string {
  return `<tr>
    <td align="center" style="padding:0 36px 40px;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="8%" stroke="f" fillcolor="#7c3aed"><w:anchorlock/><center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">${esc(label)}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-->
      <a href="${esc(href)}" style="display:inline-block;background-color:#7c3aed;color:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.1em;text-decoration:none;padding:14px 36px;border-radius:4px;text-transform:uppercase;mso-hide:all;">
        ${esc(label)} &rarr;
      </a>
      <!--<![endif]-->
    </td>
  </tr>`
}

function orderItemsTable(items: OrderItem[]): string {
  if (!items?.length) return ''
  const rows = items.map((item, i) => {
    const bg = i % 2 === 0 ? '#0d0d1a' : '#111125'
    const subtotal = (Number(item.precio_unitario) || 0) * (Number(item.cantidad) || 1)
    return `<tr>
      <td style="padding:10px 12px;background-color:${bg};border-bottom:1px solid #1a1a30;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#cbd5e1;line-height:1.4;">
        ${esc(item.nombre_producto)}
        ${item.sku ? `<div style="font-family:'Courier New',Courier,monospace;font-size:9px;color:#3b3b6a;letter-spacing:0.12em;margin-top:2px;">SKU: ${esc(item.sku)}</div>` : ''}
      </td>
      <td align="center" style="padding:10px 8px;background-color:${bg};border-bottom:1px solid #1a1a30;font-family:'Courier New',Courier,monospace;font-size:12px;color:#7c3aed;white-space:nowrap;">
        &times;${item.cantidad}
      </td>
      <td align="right" style="padding:10px 12px;background-color:${bg};border-bottom:1px solid #1a1a30;font-family:'Courier New',Courier,monospace;font-size:12px;color:#e2e8f0;white-space:nowrap;">
        ${money(subtotal)}
      </td>
    </tr>`
  }).join('')

  return `<tr>
    <td class="em-pad-h" style="padding:0 36px 8px;">
      <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#2a2a50;text-transform:uppercase;margin-bottom:10px;">// PRODUCTOS</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #1e1e3a;border-radius:4px;overflow:hidden;">
        <tr style="background-color:#111125;">
          <td style="padding:7px 12px;font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;">Producto</td>
          <td align="center" style="padding:7px 8px;font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;">Cant.</td>
          <td align="right" style="padding:7px 12px;font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;">Subtotal</td>
        </tr>
        ${rows}
      </table>
    </td>
  </tr>`
}

function totalsBlock(order: OrderData): string {
  const rows: Array<[string, string, boolean?]> = []
  if ((order.subtotal ?? 0) > 0) rows.push(['Subtotal', money(order.subtotal)])
  if ((order.descuento ?? 0) > 0) rows.push(['Descuento', `-${money(order.descuento)}`])
  if ((order.costo_envio ?? 0) > 0) rows.push(['Envío', money(order.costo_envio)])

  const regularRows = rows.map(([label, val]) => `<tr>
    <td style="padding:6px 0 6px 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#64748b;white-space:nowrap;">${esc(label)}</td>
    <td align="right" style="padding:6px 20px 6px 32px;font-family:'Courier New',Courier,monospace;font-size:12px;color:#94a3b8;white-space:nowrap;">${esc(val)}</td>
  </tr>`).join('')

  return `<tr>
    <td class="em-pad-h" style="padding:0 36px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="border:1px solid #1e1e3a;border-radius:4px;overflow:hidden;min-width:220px;">
        ${regularRows}
        <tr>
          <td style="padding:12px 0 12px 20px;background-color:#140a2e;border-top:1px solid #7c3aed;">
            <span style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:0.25em;color:#7c3aed;text-transform:uppercase;">TOTAL</span>
          </td>
          <td align="right" style="padding:12px 20px 12px 32px;background-color:#140a2e;border-top:1px solid #7c3aed;">
            <span style="font-family:'Courier New',Courier,monospace;font-size:18px;font-weight:bold;color:#c4b5fd;">${money(order.total)}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

function infoBox2Col(left: [string, string, string], right: [string, string, string]): string {
  return `<tr>
    <td class="em-pad-h" style="padding:0 36px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="em-col" width="49%" style="padding-right:6px;vertical-align:top;">
            <div style="background-color:#111125;border:1px solid #1e1e3a;border-radius:4px;padding:14px;">
              <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#2a2a50;text-transform:uppercase;margin-bottom:7px;">${esc(left[0])}</div>
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#e2e8f0;line-height:1.4;">${esc(left[1])}</div>
              ${left[2] ? `<div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#64748b;margin-top:3px;line-height:1.4;">${esc(left[2])}</div>` : ''}
            </div>
          </td>
          <td class="em-col-r" width="49%" style="padding-left:6px;vertical-align:top;">
            <div style="background-color:#111125;border:1px solid #1e1e3a;border-radius:4px;padding:14px;">
              <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#2a2a50;text-transform:uppercase;margin-bottom:7px;">${esc(right[0])}</div>
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#e2e8f0;line-height:1.4;">${esc(right[1])}</div>
              ${right[2] ? `<div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#64748b;margin-top:3px;line-height:1.4;">${esc(right[2])}</div>` : ''}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

// ──────────────────────────────────────────────────────────────
// Welcome
// ──────────────────────────────────────────────────────────────
function renderWelcome(data: WelcomeData): TemplateResult {
  const nombre = data.nombre ? ` ${String(data.nombre).split(' ')[0]}` : ''
  const content = `
  <tr>
    <td class="em-pad" style="padding:40px 36px 28px;text-align:center;">
      <div style="display:inline-block;background-color:#120a2a;border:1px solid #7c3aed;border-radius:3px;padding:5px 14px;margin-bottom:24px;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#7c3aed;text-transform:uppercase;">// BIENVENIDO AL SISTEMA</span>
      </div>
      <h1 class="em-hero-h1" style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:28px;font-weight:800;color:#f1f5f9;line-height:1.2;letter-spacing:-0.01em;">
        Tu cuenta est&aacute; activa.
      </h1>
      <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#94a3b8;line-height:1.7;">
        Hola${esc(nombre)}, ya pod&eacute;s acceder a tu panel<br>y descubrir el universo Glow Boxes.
      </p>
    </td>
  </tr>

  ${accentDivider()}

  <tr>
    <td class="em-pad" style="padding:28px 36px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="em-feat-cell" width="32%" style="padding-right:8px;vertical-align:top;">
            <div style="background-color:#111125;border:1px solid #1e1e3a;border-top:2px solid #7c3aed;border-radius:4px;padding:18px 14px;text-align:center;">
              <div style="font-size:22px;margin-bottom:10px;">&#128230;</div>
              <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#7c3aed;text-transform:uppercase;margin-bottom:6px;">MYSTERY BOX</div>
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#64748b;line-height:1.5;">Experiencias &uacute;nicas en cada caja</div>
            </div>
          </td>
          <td class="em-feat-cell" width="32%" style="padding:0 4px;vertical-align:top;">
            <div style="background-color:#111125;border:1px solid #1e1e3a;border-top:2px solid #7c3aed;border-radius:4px;padding:18px 14px;text-align:center;">
              <div style="font-size:22px;margin-bottom:10px;">&#10022;</div>
              <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#7c3aed;text-transform:uppercase;margin-bottom:6px;">CALIDAD</div>
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#64748b;line-height:1.5;">Productos premium seleccionados</div>
            </div>
          </td>
          <td class="em-feat-cell" width="32%" style="padding-left:8px;vertical-align:top;">
            <div style="background-color:#111125;border:1px solid #1e1e3a;border-top:2px solid #7c3aed;border-radius:4px;padding:18px 14px;text-align:center;">
              <div style="font-size:22px;margin-bottom:10px;">&#128640;</div>
              <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#7c3aed;text-transform:uppercase;margin-bottom:6px;">ENV&Iacute;OS</div>
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#64748b;line-height:1.5;">A todo el pa&iacute;s, r&aacute;pido y seguro</div>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${ctaButton('EXPLORAR PRODUCTOS', `${BASE_URL}/index.html`)}
  `

  return {
    subject: `Bienvenid${nombre ? 'o' : '/a'} a Glow Boxes ✦`,
    html: baseWrapper({
      preheader: `Tu cuenta Glow Boxes está lista${nombre}. Explorá nuestras mystery boxes ahora.`,
      headerTag: 'BIENVENIDA',
      title: 'Bienvenido/a a Glow Boxes',
      content,
    }),
  }
}

// ──────────────────────────────────────────────────────────────
// Order Confirmation
// ──────────────────────────────────────────────────────────────
function renderOrderConfirmation(data: OrderData): TemplateResult {
  const nombre = data.cliente_nombre ? ` ${String(data.cliente_nombre).split(' ')[0]}` : ''

  const content = `
  <tr>
    <td class="em-pad" style="padding:32px 36px 24px;">
      <div style="display:inline-block;background-color:#0a200f;border:1px solid #16a34a;border-radius:3px;padding:4px 12px;margin-bottom:20px;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#16a34a;text-transform:uppercase;">&#10003; PEDIDO CONFIRMADO</span>
      </div>

      <div style="background-color:#111125;border:1px solid #7c3aed;border-radius:4px;padding:16px 20px;margin-bottom:22px;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#2a2a50;margin-bottom:5px;text-transform:uppercase;">// N&Uacute;MERO DE PEDIDO</div>
        <div style="font-family:'Courier New',Courier,monospace;font-size:26px;font-weight:bold;color:#a78bfa;letter-spacing:0.1em;">${esc(data.numero)}</div>
      </div>

      <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#94a3b8;line-height:1.7;">
        Hola${esc(nombre)}, recibimos tu pedido correctamente.<br>
        Te notificaremos cuando est&eacute; en camino.
      </p>
    </td>
  </tr>

  ${accentDivider()}

  ${orderItemsTable(data.items || [])}

  ${totalsBlock(data)}

  ${infoBox2Col(
    ['// PAGO', payLabel(data.metodo_pago), pagoEstadoLabel(data.pago_estado)],
    ['// ENV&Iacute;O', shipLabel(data.metodo_envio), '']
  )}

  ${ctaButton('VER MI PEDIDO', `${BASE_URL}/cliente.html`)}
  `

  return {
    subject: `Pedido ${data.numero} confirmado ✦ Glow Boxes`,
    html: baseWrapper({
      preheader: `Tu pedido ${data.numero} fue recibido. Total: ${money(data.total)}.`,
      headerTag: 'CONFIRMACI&Oacute;N',
      title: `Pedido ${data.numero} — Glow Boxes`,
      content,
    }),
  }
}

// ──────────────────────────────────────────────────────────────
// Payment Approved
// ──────────────────────────────────────────────────────────────
function renderPaymentApproved(data: OrderData): TemplateResult {
  const nombre = data.cliente_nombre ? ` ${String(data.cliente_nombre).split(' ')[0]}` : ''

  const content = `
  <tr>
    <td class="em-pad" style="padding:36px 36px 28px;text-align:center;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background-color:#0a200f;border:2px solid #16a34a;border-radius:50%;margin-bottom:20px;">
        <span style="font-size:28px;">&#10003;</span>
      </div>
      <div style="display:block;background-color:#0a200f;border:1px solid #16a34a;border-radius:3px;padding:4px 14px;margin-bottom:20px;display:inline-block;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#16a34a;text-transform:uppercase;">PAGO ACREDITADO</span>
      </div>
      <h1 class="em-hero-h1" style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:26px;font-weight:800;color:#f1f5f9;line-height:1.2;">
        &iexcl;Tu pago fue confirmado!
      </h1>
      <p style="margin:0 0 6px;font-family:'Courier New',Courier,monospace;font-size:22px;color:#a78bfa;letter-spacing:0.08em;">${esc(data.numero)}</p>
      <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#64748b;line-height:1.7;">
        Hola${esc(nombre)}, ya estamos preparando tu pedido.
      </p>
    </td>
  </tr>

  ${accentDivider()}

  <tr>
    <td class="em-pad" style="padding:28px 36px 24px;">
      <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#2a2a50;text-transform:uppercase;margin-bottom:14px;">// PR&Oacute;XIMOS PASOS</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${[
          ['01', 'Preparaci&oacute;n', 'Estamos armando tu pedido con cuidado.'],
          ['02', 'Env&iacute;o', 'Recibirás una notificación cuando sea despachado.'],
          ['03', 'Entrega', 'Tu paquete llegar&aacute; en el plazo acordado.'],
        ].map(([n, title, desc]) => `<tr>
          <td style="padding:0 0 14px;">
            <div style="background-color:#111125;border:1px solid #1e1e3a;border-left:3px solid #7c3aed;border-radius:0 4px 4px 0;padding:12px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:14px;vertical-align:middle;">
                    <span style="font-family:'Courier New',Courier,monospace;font-size:18px;color:#5b21b6;font-weight:bold;">${n}</span>
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:600;color:#e2e8f0;">${title}</div>
                    <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#64748b;margin-top:2px;line-height:1.4;">${desc}</div>
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>`).join('')}
      </table>
    </td>
  </tr>

  ${totalsBlock(data)}

  ${ctaButton('VER MI PEDIDO', `${BASE_URL}/cliente.html`)}
  `

  return {
    subject: `✓ Pago acreditado — Pedido ${data.numero} en preparación`,
    html: baseWrapper({
      preheader: `Tu pago fue confirmado. Ya estamos preparando tu pedido ${data.numero}.`,
      headerTag: 'PAGO ACREDITADO',
      title: `Pago confirmado — ${data.numero}`,
      content,
    }),
  }
}

// ──────────────────────────────────────────────────────────────
// Order Shipped
// ──────────────────────────────────────────────────────────────
function renderOrderShipped(data: OrderData): TemplateResult {
  const nombre = data.cliente_nombre ? ` ${String(data.cliente_nombre).split(' ')[0]}` : ''
  const tracking = data.tracking_code || data.numero_seguimiento || null

  const content = `
  <tr>
    <td class="em-pad" style="padding:36px 36px 28px;text-align:center;">
      <div style="display:inline-block;background-color:#0a0f20;border:1px solid #3b82f6;border-radius:3px;padding:4px 14px;margin-bottom:20px;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#60a5fa;text-transform:uppercase;">EN CAMINO &#8594;</span>
      </div>
      <h1 class="em-hero-h1" style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:26px;font-weight:800;color:#f1f5f9;line-height:1.2;">
        &iexcl;Tu pedido est&aacute; en camino!
      </h1>
      <p style="margin:0 0 6px;font-family:'Courier New',Courier,monospace;font-size:22px;color:#a78bfa;letter-spacing:0.08em;">${esc(data.numero)}</p>
      <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#64748b;line-height:1.7;">
        Hola${esc(nombre)}, tu pedido fue despachado.
      </p>
    </td>
  </tr>

  ${accentDivider()}

  ${tracking ? `<tr>
    <td class="em-pad" style="padding:28px 36px 8px;">
      <div style="background-color:#0a0f20;border:1px solid #1e3a5f;border-left:3px solid #3b82f6;border-radius:0 4px 4px 0;padding:16px 20px;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#1d4ed8;text-transform:uppercase;margin-bottom:8px;">// C&Oacute;DIGO DE SEGUIMIENTO</div>
        <div style="font-family:'Courier New',Courier,monospace;font-size:18px;font-weight:bold;color:#93c5fd;letter-spacing:0.12em;">${esc(tracking)}</div>
        ${data.eta ? `<div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#64748b;margin-top:6px;">Entrega estimada: ${esc(data.eta)}</div>` : ''}
      </div>
    </td>
  </tr>` : ''}

  <tr>
    <td class="em-pad" style="padding:20px 36px 24px;">
      <div style="background-color:#111125;border:1px solid #1e1e3a;border-radius:4px;padding:14px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:middle;padding-right:12px;">
              <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;margin-bottom:5px;">// M&Eacute;TODO DE ENV&Iacute;O</div>
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#e2e8f0;">${esc(shipLabel(data.metodo_envio))}</div>
            </td>
            <td style="vertical-align:middle;" align="right">
              <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;margin-bottom:5px;">// TOTAL</div>
              <div style="font-family:'Courier New',Courier,monospace;font-size:16px;color:#c4b5fd;font-weight:bold;">${money(data.total)}</div>
            </td>
          </tr>
        </table>
      </div>
    </td>
  </tr>

  ${ctaButton('VER MI PEDIDO', `${BASE_URL}/cliente.html`)}
  `

  return {
    subject: `🚀 Tu pedido ${data.numero} está en camino`,
    html: baseWrapper({
      preheader: `Tu pedido ${data.numero} fue despachado.${tracking ? ` Código de seguimiento: ${tracking}.` : ''}`,
      headerTag: 'EN CAMINO',
      title: `Pedido en camino — ${data.numero}`,
      content,
    }),
  }
}

// ──────────────────────────────────────────────────────────────
// Order Delivered
// ──────────────────────────────────────────────────────────────
function renderOrderDelivered(data: OrderData): TemplateResult {
  const nombre = data.cliente_nombre ? ` ${String(data.cliente_nombre).split(' ')[0]}` : ''

  const content = `
  <tr>
    <td class="em-pad" style="padding:36px 36px 28px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">&#10024;</div>
      <div style="display:inline-block;background-color:#0a200f;border:1px solid #16a34a;border-radius:3px;padding:4px 14px;margin-bottom:20px;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#16a34a;text-transform:uppercase;">PEDIDO ENTREGADO</span>
      </div>
      <h1 class="em-hero-h1" style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:26px;font-weight:800;color:#f1f5f9;line-height:1.2;">
        &iexcl;Tu pedido lleg&oacute;!
      </h1>
      <p style="margin:0 0 6px;font-family:'Courier New',Courier,monospace;font-size:22px;color:#a78bfa;letter-spacing:0.08em;">${esc(data.numero)}</p>
      <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#94a3b8;line-height:1.7;">
        Hola${esc(nombre)}, esperamos que disfrutes tu compra.<br>
        Tu experiencia Glow Boxes est&aacute; comenzando.
      </p>
    </td>
  </tr>

  ${accentDivider()}

  <tr>
    <td class="em-pad" style="padding:28px 36px 24px;">
      <div style="background-color:#111125;border:1px solid #1e1e3a;border-top:2px solid #7c3aed;border-radius:4px;padding:20px;text-align:center;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#2a2a50;text-transform:uppercase;margin-bottom:12px;">// TOTAL DE TU PEDIDO</div>
        <div style="font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:bold;color:#c4b5fd;letter-spacing:0.06em;">${money(data.total)}</div>
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#2a2a50;margin-top:6px;">${esc(data.numero)}</div>
      </div>
    </td>
  </tr>

  <tr>
    <td class="em-pad" style="padding:0 36px 24px;text-align:center;">
      <p style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#64748b;line-height:1.7;">
        &iquest;Algo no est&aacute; bien? Cont&aacute;ctanos en<br>
        <a href="mailto:soporte@glowboxes.com.ar" style="color:#7c3aed;text-decoration:none;">soporte@glowboxes.com.ar</a>
      </p>
      <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:0.2em;color:#252542;text-transform:uppercase;">
        // Gracias por confiar en Glow Boxes
      </p>
    </td>
  </tr>

  ${ctaButton('VER MIS PEDIDOS', `${BASE_URL}/cliente.html`)}
  `

  return {
    subject: `✨ ¡Tu pedido ${data.numero} llegó! — Glow Boxes`,
    html: baseWrapper({
      preheader: `¡Tu pedido ${data.numero} fue entregado! Esperamos que lo disfrutes.`,
      headerTag: 'ENTREGADO',
      title: `Pedido entregado — ${data.numero}`,
      content,
    }),
  }
}

// ──────────────────────────────────────────────────────────────
// Password Recovery
// ──────────────────────────────────────────────────────────────
function renderPasswordRecovery(data: PasswordRecoveryData & Record<string, unknown>): TemplateResult {
  const nombre = data.nombre ? ` ${String(data.nombre).split(' ')[0]}` : ''
  const resetUrl = (data.reset_url as string) || `${BASE_URL}/login.html`

  const content = `
  <tr>
    <td class="em-pad" style="padding:36px 36px 28px;text-align:center;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background-color:#140a2e;border:2px solid #7c3aed;border-radius:50%;margin-bottom:20px;">
        <span style="font-size:28px;">&#128274;</span>
      </div>
      <div style="display:inline-block;background-color:#140a2e;border:1px solid #7c3aed;border-radius:3px;padding:4px 14px;margin-bottom:20px;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#a78bfa;text-transform:uppercase;">// RECUPERACI&Oacute;N DE ACCESO</span>
      </div>
      <h1 class="em-hero-h1" style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:26px;font-weight:800;color:#f1f5f9;line-height:1.2;">
        &iquest;Olvidaste tu contrase&ntilde;a?
      </h1>
      <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#94a3b8;line-height:1.7;">
        Hola${esc(nombre)}, recibimos una solicitud<br>para restablecer el acceso a tu cuenta.
      </p>
    </td>
  </tr>

  ${accentDivider()}

  <tr>
    <td class="em-pad" style="padding:28px 36px 24px;">
      <div style="background-color:#0f0920;border:1px solid #4c1d95;border-left:3px solid #7c3aed;border-radius:0 4px 4px 0;padding:20px 20px 20px 18px;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#3b1d8a;text-transform:uppercase;margin-bottom:10px;">// INSTRUCCIONES</div>
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#94a3b8;line-height:1.7;">
          Hac&eacute; clic en el bot&oacute;n a continuaci&oacute;n para crear una nueva contrase&ntilde;a.
          Este enlace es v&aacute;lido por <strong style="color:#c4b5fd;">60 minutos</strong>.
        </p>
        <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#3b3b6a;line-height:1.5;">
          Si no solicitaste este cambio, ignor&aacute; este email.
          Tu contrase&ntilde;a actual no se ver&aacute; afectada.
        </p>
      </div>
    </td>
  </tr>

  ${ctaButton('RESTABLECER CONTRASEÑA', resetUrl)}

  <tr>
    <td style="padding:0 36px 32px;text-align:center;">
      <div style="background-color:#080810;border:1px solid #1a1a30;border-radius:3px;padding:12px 16px;">
        <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:0.15em;color:#252542;text-transform:uppercase;">
          // Por seguridad, nunca te pediremos tu contrase&ntilde;a por email
        </p>
      </div>
    </td>
  </tr>
  `

  return {
    subject: `Recuperá tu acceso a Glow Boxes`,
    html: baseWrapper({
      preheader: `Solicitud de restablecimiento de contraseña${nombre}. El enlace vence en 60 minutos.`,
      headerTag: 'SEGURIDAD',
      title: 'Recuperación de contraseña — Glow Boxes',
      content,
    }),
  }
}

// ──────────────────────────────────────────────────────────────
// Contact Received  (customer confirmation + admin notification)
// ──────────────────────────────────────────────────────────────
function renderContactReceived(data: ContactData & Record<string, unknown>): TemplateResult {
  const isAdmin = data._admin === true
  const nombre = data.nombre ? esc(data.nombre) : 'Cliente'
  const motivo = data.motivo || data.tipo || data.asunto || 'Consulta general'
  const mensajePreview = data.mensaje ? String(data.mensaje).slice(0, 200) + (String(data.mensaje).length > 200 ? '…' : '') : ''

  if (isAdmin) {
    // ── Admin notification ──
    const fields: Array<[string, string]> = [
      ['Nombre', data.nombre],
      ['Email', data.email],
    ]
    if (data.telefono) fields.push(['Teléfono', data.telefono])
    if (data.tipo) fields.push(['Tipo de cliente', data.tipo])
    if (data.rubro) fields.push(['Rubro', data.rubro])
    if (data.asunto) fields.push(['Asunto', data.asunto])
    if (data.motivo) fields.push(['Motivo', data.motivo])
    if (data.submitted_at) fields.push(['Fecha', new Date(data.submitted_at).toLocaleString('es-AR')])

    const fieldRows = fields.map(([label, val]) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1a1a30;background-color:#0d0d1a;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:0.2em;color:#3b3b6a;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1a1a30;background-color:#0d0d1a;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#cbd5e1;line-height:1.4;">${esc(val)}</td>
    </tr>`).join('')

    const content = `
    <tr>
      <td class="em-pad" style="padding:28px 36px 20px;">
        <div style="background-color:#0a0f1a;border:1px solid #1e2a3a;border-left:3px solid #f59e0b;border-radius:0 4px 4px 0;padding:14px 16px;margin-bottom:20px;">
          <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#78350f;text-transform:uppercase;margin-bottom:6px;">// NUEVO CONTACTO RECIBIDO</div>
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:700;color:#fbbf24;">${esc(nombre)}</div>
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#64748b;margin-top:3px;">${esc(motivo)}</div>
        </div>
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#2a2a50;text-transform:uppercase;margin-bottom:10px;">// DATOS DEL FORMULARIO</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #1e1e3a;border-radius:4px;overflow:hidden;">
          ${fieldRows}
        </table>
      </td>
    </tr>
    ${accentDivider()}
    <tr>
      <td class="em-pad" style="padding:20px 36px 16px;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#2a2a50;text-transform:uppercase;margin-bottom:8px;">// MENSAJE</div>
        <div style="background-color:#111125;border:1px solid #1e1e3a;border-radius:4px;padding:16px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#94a3b8;line-height:1.7;white-space:pre-wrap;">${esc(data.mensaje || '')}</div>
      </td>
    </tr>
    ${ctaButton('RESPONDER', `mailto:${esc(data.email)}`)}
    `

    return {
      subject: `[Contacto] ${esc(nombre)} — ${esc(motivo)}`,
      html: baseWrapper({
        preheader: `Nuevo mensaje de ${data.nombre}: ${mensajePreview}`,
        headerTag: 'ADMIN · CONTACTO',
        title: `Nuevo contacto — Glow Boxes Admin`,
        content,
      }),
    }
  }

  // ── Customer confirmation ──
  const content = `
  <tr>
    <td class="em-pad" style="padding:36px 36px 24px;text-align:center;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background-color:#0a200f;border:2px solid #16a34a;border-radius:50%;margin-bottom:18px;">
        <span style="font-size:24px;">&#10003;</span>
      </div>
      <div style="display:inline-block;background-color:#0a200f;border:1px solid #16a34a;border-radius:3px;padding:4px 14px;margin-bottom:20px;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#16a34a;text-transform:uppercase;">MENSAJE RECIBIDO</span>
      </div>
      <h1 class="em-hero-h1" style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:26px;font-weight:800;color:#f1f5f9;line-height:1.2;">
        &iexcl;Recibimos tu mensaje!
      </h1>
      <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#94a3b8;line-height:1.7;">
        Hola ${nombre}, gracias por contactarnos.<br>
        Nuestro equipo revisar&aacute; tu consulta a la brevedad.
      </p>
    </td>
  </tr>

  ${accentDivider()}

  <tr>
    <td class="em-pad" style="padding:24px 36px 20px;">
      <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#2a2a50;text-transform:uppercase;margin-bottom:12px;">// RESUMEN DE TU CONSULTA</div>
      <div style="background-color:#111125;border:1px solid #1e1e3a;border-radius:4px;padding:16px;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;margin-bottom:5px;">Motivo</div>
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#e2e8f0;margin-bottom:14px;">${esc(motivo)}</div>
        <div style="height:1px;background-color:#1e1e3a;margin-bottom:14px;"></div>
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;margin-bottom:5px;">Tu mensaje</div>
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#94a3b8;line-height:1.7;">${esc(mensajePreview)}</div>
      </div>
    </td>
  </tr>

  <tr>
    <td class="em-pad" style="padding:0 36px 28px;">
      <div style="background-color:#0a0f20;border:1px solid #1e2a3a;border-left:3px solid #3b82f6;border-radius:0 4px 4px 0;padding:14px 16px;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.3em;color:#1d4ed8;text-transform:uppercase;margin-bottom:6px;">// TIEMPO DE RESPUESTA</div>
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#94a3b8;line-height:1.6;">
          Nuestro equipo responde en las pr&oacute;ximas <strong style="color:#93c5fd;">24 a 48 horas h&aacute;biles</strong>.<br>
          <span style="font-size:12px;color:#3b3b6a;">Si tu consulta es urgente, escribinos a <a href="mailto:soporte@glowboxes.com.ar" style="color:#7c3aed;text-decoration:none;">soporte@glowboxes.com.ar</a></span>
        </div>
      </div>
    </td>
  </tr>

  ${ctaButton('VER NUESTROS PRODUCTOS', `${BASE_URL}/index.html`)}
  `

  return {
    subject: `Recibimos tu mensaje — Glow Boxes`,
    html: baseWrapper({
      preheader: `Hola ${data.nombre}, recibimos tu consulta y te respondemos en las próximas 24-48hs.`,
      headerTag: 'SOPORTE',
      title: 'Mensaje recibido — Glow Boxes',
      content,
    }),
  }
}

// ──────────────────────────────────────────────────────────────
// Invoice Available
// ──────────────────────────────────────────────────────────────
function renderInvoiceAvailable(data: InvoiceData): TemplateResult {
  const nombre = data.cliente_nombre ? ` ${String(data.cliente_nombre).split(' ')[0]}` : ''
  const fechaStr = data.created_at
    ? new Date(data.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    : ''

  const content = `
  <tr>
    <td class="em-pad" style="padding:36px 36px 24px;text-align:center;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background-color:#140a2e;border:2px solid #7c3aed;border-radius:50%;margin-bottom:18px;">
        <span style="font-size:28px;">&#128196;</span>
      </div>
      <div style="display:inline-block;background-color:#140a2e;border:1px solid #7c3aed;border-radius:3px;padding:4px 14px;margin-bottom:20px;">
        <span style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#a78bfa;text-transform:uppercase;">BOLETA DISPONIBLE</span>
      </div>
      <h1 class="em-hero-h1" style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:26px;font-weight:800;color:#f1f5f9;line-height:1.2;">
        Tu comprobante de compra<br>est&aacute; listo.
      </h1>
      <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#94a3b8;line-height:1.7;">
        Hola${esc(nombre)}, pod&eacute;s descargar tu boleta<br>desde tu panel de cliente en cualquier momento.
      </p>
    </td>
  </tr>

  ${accentDivider()}

  <tr>
    <td class="em-pad" style="padding:24px 36px 20px;">
      <div style="background-color:#111125;border:1px solid #7c3aed;border-radius:4px;padding:20px;text-align:center;">
        <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.35em;color:#2a2a50;text-transform:uppercase;margin-bottom:6px;">// N&Uacute;MERO DE PEDIDO</div>
        <div style="font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:bold;color:#a78bfa;letter-spacing:0.1em;margin-bottom:14px;">${esc(data.numero)}</div>
        <div style="height:1px;background:linear-gradient(to right,transparent,#7c3aed 40%,#7c3aed 60%,transparent);margin-bottom:14px;"></div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            ${fechaStr ? `<td align="center" style="padding:0 8px;">
              <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;margin-bottom:4px;">Fecha</div>
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#64748b;">${esc(fechaStr)}</div>
            </td>` : ''}
            ${data.total ? `<td align="center" style="padding:0 8px;">
              <div style="font-family:'Courier New',Courier,monospace;font-size:8px;letter-spacing:0.25em;color:#2a2a50;text-transform:uppercase;margin-bottom:4px;">Total</div>
              <div style="font-family:'Courier New',Courier,monospace;font-size:16px;color:#c4b5fd;font-weight:bold;">${money(data.total)}</div>
            </td>` : ''}
          </tr>
        </table>
      </div>
    </td>
  </tr>

  <tr>
    <td class="em-pad" style="padding:0 36px 24px;">
      <div style="background-color:#080810;border:1px solid #1a1a30;border-radius:4px;padding:14px 16px;text-align:center;">
        <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#3b3b6a;line-height:1.6;">
          Guard&aacute; este comprobante para tus registros. Tambi&eacute;n pod&eacute;s descargarlo en cualquier momento<br>desde la secci&oacute;n <em style="color:#5b21b6;">Mis Pedidos</em> en tu panel de cliente.
        </p>
      </div>
    </td>
  </tr>

  ${ctaButton('DESCARGAR BOLETA', `${BASE_URL}/cliente.html`)}
  `

  return {
    subject: `Tu boleta de compra — Pedido ${data.numero}`,
    html: baseWrapper({
      preheader: `Tu comprobante del pedido ${data.numero} está disponible para descargar.`,
      headerTag: 'BOLETA',
      title: `Boleta disponible — Pedido ${data.numero}`,
      content,
    }),
  }
}

// ──────────────────────────────────────────────────────────────
// Dispatcher
// ──────────────────────────────────────────────────────────────
export function renderTemplate(type: EmailType, data: Record<string, unknown>): TemplateResult {
  switch (type) {
    case 'welcome':
      return renderWelcome(data as WelcomeData)
    case 'order_confirmation':
      return renderOrderConfirmation(data as OrderData)
    case 'payment_approved':
      return renderPaymentApproved(data as OrderData)
    case 'order_shipped':
      return renderOrderShipped(data as OrderData)
    case 'order_delivered':
      return renderOrderDelivered(data as OrderData)
    case 'password_recovery':
      return renderPasswordRecovery(data as PasswordRecoveryData & Record<string, unknown>)
    case 'contact_received':
      return renderContactReceived(data as ContactData & Record<string, unknown>)
    case 'invoice_available':
      return renderInvoiceAvailable(data as InvoiceData)
    default:
      throw new Error(`Unknown email type: ${type}`)
  }
}
