import { supabase } from './supabase.js'

// Fire-and-forget transactional email via Supabase Edge Function.
// Never throws — errors are logged but do not break the caller flow.
export async function sendTransactionalEmail(type, to, data = {}) {
  if (!to || !type) return { ok: false, reason: 'missing to or type' }
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { type, to, data },
    })
    if (error) {
      console.warn(`[email] ${type} -> ${to} failed:`, error.message || error)
      return { ok: false, reason: error.message || String(error) }
    }
    return { ok: true }
  } catch (err) {
    console.warn(`[email] ${type} -> ${to} unexpected error:`, err)
    return { ok: false, reason: err?.message || String(err) }
  }
}
