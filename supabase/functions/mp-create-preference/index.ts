import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MP_API = 'https://api.mercadopago.com/checkout/preferences'
const TIMEOUT_MS = 15_000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function verifyJwt(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user.id
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const userId = await verifyJwt(req)
  if (!userId) return json({ error: 'Unauthorized' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { pedido_id, numero, items, total, cliente_email } = body as {
    pedido_id: string
    numero: string
    items: Array<{ nombre: string; cantidad: number; precio_unitario: number }>
    total: number
    cliente_email?: string
  }

  if (!pedido_id || !numero || !items?.length || !total) {
    return json({ error: 'Missing required fields: pedido_id, numero, items, total' }, 400)
  }

  const accessToken = Deno.env.get('MP_ACCESS_TOKEN')
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN secret is not configured')

  const siteUrl = Deno.env.get('SITE_URL') || 'https://glowboxes.com.ar'
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

  const preference = {
    items: items.map(i => ({
      title: i.nombre,
      quantity: i.cantidad,
      unit_price: Number(i.precio_unitario),
      currency_id: 'ARS',
    })),
    payer: cliente_email ? { email: cliente_email } : undefined,
    back_urls: {
      success: `${siteUrl}/checkout.html?pago=ok&numero=${numero}`,
      failure: `${siteUrl}/checkout.html?pago=fail&numero=${numero}`,
      pending: `${siteUrl}/checkout.html?pago=pending&numero=${numero}`,
    },
    auto_return: 'approved',
    notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
    external_reference: numero,
    statement_descriptor: 'Glow Boxes',
  }

  let mpRes: Response
  try {
    mpRes = await fetch(MP_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': pedido_id,
      },
      body: JSON.stringify(preference),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return json({ error: 'MercadoPago API timeout' }, 502)
    }
    throw err
  }

  const mpBody = await mpRes.json().catch(() => ({}))
  if (!mpRes.ok) {
    console.error('[mp-create-preference] MP API error:', mpBody)
    return json({ error: 'Failed to create MP preference' }, 502)
  }

  // Persist preference_id so webhook can resolve it
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  await supabase
    .from('pedidos')
    .update({ mp_preference_id: mpBody.id })
    .eq('id', pedido_id)

  return json({
    preference_id: mpBody.id,
    init_point: mpBody.init_point,
    sandbox_init_point: mpBody.sandbox_init_point,
  })
})
