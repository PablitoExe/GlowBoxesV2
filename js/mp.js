import { supabase } from './supabase.js'

/**
 * Creates a MercadoPago preference and returns the redirect URLs.
 *
 * @param {{ pedido_id: string, numero: string, items: Array, total: number, cliente_email?: string }} opts
 * @returns {Promise<{ preference_id: string, init_point: string, sandbox_init_point: string }>}
 */
export async function createMpPreference(opts) {
  const { data, error } = await supabase.functions.invoke('mp-create-preference', {
    body: opts,
  })
  if (error) throw new Error(error.message || 'No se pudo iniciar el pago con Mercado Pago.')
  if (!data?.init_point) throw new Error('Respuesta inválida de Mercado Pago.')
  return data
}

/**
 * Redirects to the MercadoPago checkout for an order.
 * Saves order info to sessionStorage so the return page can display it.
 */
export async function redirectToMpCheckout({ pedido_id, numero, items, total, cliente_email }) {
  sessionStorage.setItem('gb_mp_pedido', JSON.stringify({ pedido_id, numero, total }))
  const { init_point } = await createMpPreference({ pedido_id, numero, items, total, cliente_email })
  window.location.href = init_point
}
