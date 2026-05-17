import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email-provider.ts'
import { renderTemplate } from '../_shared/templates.ts'
import type { EmailPayload, EmailType } from '../_shared/types.ts'
import { PUBLIC_EMAIL_TYPES } from '../_shared/types.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_FROM  = Deno.env.get('EMAIL_FROM')  || 'Glow Boxes <noreply@glowboxes.com.ar>'
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'hola@glowboxes.ar'
const REPLY_TO    = Deno.env.get('REPLY_TO')    || 'soporte@glowboxes.com.ar'

const VALID_TYPES = new Set<EmailType>([
  'welcome',
  'order_confirmation',
  'payment_approved',
  'order_shipped',
  'order_delivered',
  'password_recovery',
  'contact_received',
  'invoice_available',
])

// ── In-memory rate limiting for public endpoints ──────────────
// Resets on cold start — acceptable for basic spam protection.
const _rateMap = new Map<string, { count: number; windowStart: number }>()
const RATE_MAX       = 3
const RATE_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = _rateMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    _rateMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_MAX) return false
  entry.count++
  return true
}

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return xff ? xff.split(',')[0].trim() : 'unknown'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function verifyJwt(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  return !error && !!user
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let payload: EmailPayload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!payload?.to || !payload?.type) {
    return json({ error: 'Missing required fields: to, type' }, 400)
  }
  // Don't echo back the unknown type — avoid leaking internals
  if (!VALID_TYPES.has(payload.type)) {
    return json({ error: 'Unknown email type' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to)) {
    return json({ error: 'Invalid recipient email address' }, 400)
  }

  if (PUBLIC_EMAIL_TYPES.has(payload.type)) {
    // Public endpoint: rate-limit by IP instead of requiring JWT
    const ip = getClientIp(req)
    if (!checkRateLimit(ip)) {
      return json({ error: 'Too many requests — try again in 10 minutes.' }, 429)
    }
  } else {
    const authenticated = await verifyJwt(req)
    if (!authenticated) {
      return json({ error: 'Unauthorized' }, 401)
    }
  }

  try {
    const { subject, html } = renderTemplate(payload.type, payload.data || {})

    // contact_received customer copy has no reply-to (noreply is intentional)
    // admin copy gets the customer's email as reply-to so admin can reply directly
    const replyTo = (payload.type === 'contact_received') ? undefined : REPLY_TO

    const result = await sendEmail({ from: EMAIL_FROM, to: payload.to, subject, html, replyTo })
    if (result.error) {
      console.error('[send-email] delivery failed:', result.error, { type: payload.type })
      return json({ error: 'Email delivery failed' }, 502)
    }

    // Admin notification copy for contact_received
    if (payload.type === 'contact_received') {
      try {
        const customerEmail = payload.data?.email as string | undefined
        const { subject: aSubj, html: aHtml } = renderTemplate('contact_received', {
          ...payload.data,
          _admin: true,
        })
        await sendEmail({
          from: EMAIL_FROM,
          to: ADMIN_EMAIL,
          subject: aSubj,
          html: aHtml,
          replyTo: customerEmail || REPLY_TO,
        })
      } catch (adminErr) {
        console.warn('[send-email] Admin copy failed (non-fatal):', adminErr)
      }
    }

    return json({ ok: true, id: result.id })
  } catch (err) {
    console.error('[send-email] Unexpected error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
