import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// HMAC-SHA256 signature validation
// MP sends: x-signature: ts=<ts>,v1=<hash>
// Payload string: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
async function validateSignature(req: Request, dataId: string): Promise<boolean> {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET')
  if (!secret) {
    console.warn('[mp-webhook] MP_WEBHOOK_SECRET not set — skipping signature check')
    return true
  }

  const sig = req.headers.get('x-signature') || ''
  const requestId = req.headers.get('x-request-id') || ''

  const tsMatch = sig.match(/ts=(\d+)/)
  const v1Match = sig.match(/v1=([a-f0-9]+)/)
  if (!tsMatch || !v1Match) return false

  const ts = tsMatch[1]
  const receivedHash = v1Match[1]

  const payload = `id:${dataId};request-id:${requestId};ts:${ts};`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const computed = Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return computed === receivedHash
}

// Map MP payment status to our pago_estado values
function mapMpStatus(mpStatus: string): string | null {
  const map: Record<string, string> = {
    approved:    'acreditado',
    pending:     'pendiente',
    in_process:  'pendiente',
    rejected:    'rechazado',
    cancelled:   'rechazado',
    refunded:    'reembolsado',
    charged_back: 'reembolsado',
  }
  return map[mpStatus] ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // MP sends topic=payment and data.id for payment notifications
  const topic = (body.type || body.topic) as string
  const dataId = (body.data as Record<string, string>)?.id

  if (topic !== 'payment' || !dataId) {
    // Non-payment events (subscriptions, etc.) — acknowledge silently
    return json({ ok: true })
  }

  const valid = await validateSignature(req, dataId)
  if (!valid) {
    console.error('[mp-webhook] Signature validation failed', { dataId })
    return json({ error: 'Invalid signature' }, 401)
  }

  const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN secret is not configured')

  // Fetch payment details from MP
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (!mpRes.ok) {
    console.error('[mp-webhook] Failed to fetch payment', { dataId, status: mpRes.status })
    return json({ error: 'Failed to fetch payment from MP' }, 502)
  }

  const payment = await mpRes.json()
  const externalRef = payment.external_reference as string | undefined
  const mpStatus = payment.status as string

  if (!externalRef) {
    console.warn('[mp-webhook] No external_reference on payment', { dataId })
    return json({ ok: true })
  }

  const newPagoEstado = mapMpStatus(mpStatus)
  if (!newPagoEstado) {
    console.warn('[mp-webhook] Unknown MP status', { mpStatus })
    return json({ ok: true })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Idempotency: skip if already processed with same payment and status
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, pago_estado, mp_payment_id')
    .eq('numero', externalRef)
    .single()

  if (!pedido) {
    console.warn('[mp-webhook] Pedido not found', { externalRef })
    return json({ ok: true })
  }

  if (pedido.mp_payment_id === String(payment.id) && pedido.pago_estado === newPagoEstado) {
    return json({ ok: true, skipped: 'already_processed' })
  }

  // Update pedido
  const { error: updateError } = await supabase
    .from('pedidos')
    .update({
      mp_payment_id:  String(payment.id),
      mp_status:      mpStatus,
      pago_estado:    newPagoEstado,
      estado:         newPagoEstado === 'acreditado' ? 'confirmado' : pedido.pago_estado === 'acreditado' ? 'cancelado' : 'pendiente',
    })
    .eq('id', pedido.id)

  if (updateError) {
    console.error('[mp-webhook] Failed to update pedido', updateError)
    return json({ error: 'DB update failed' }, 500)
  }

  // Release stock if payment was rejected or refunded
  if (newPagoEstado === 'rechazado' || newPagoEstado === 'reembolsado') {
    const { error: stockErr } = await supabase.rpc('release_order_stock', {
      p_pedido_id: pedido.id,
    })
    if (stockErr) {
      console.error('[mp-webhook] release_order_stock failed (non-fatal):', stockErr)
    }
  }

  console.log('[mp-webhook] Processed', { externalRef, mpStatus, newPagoEstado, paymentId: payment.id })
  return json({ ok: true })
})
