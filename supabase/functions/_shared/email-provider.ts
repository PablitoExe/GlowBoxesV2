// Resend email adapter. Replace this file to swap providers.
const RESEND_API = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

export interface SendOptions {
  from: string
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export interface SendResult {
  id?: string
  error?: string
}

export async function sendEmail(opts: SendOptions): Promise<SendResult> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) throw new Error('RESEND_API_KEY secret is not configured')

  let res: Response
  try {
    res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text    ? { text:     opts.text    } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return { error: `Resend API did not respond within ${TIMEOUT_MS / 1000}s` }
    }
    throw err
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { error: body?.message || body?.name || `HTTP ${res.status}` }
  }
  return { id: body.id }
}
