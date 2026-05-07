import { supabase } from './supabase.js'

async function initNav() {
  const { data: { session } } = await supabase.auth.getSession()
  const btn = document.querySelector('.btn-login-nav')
  if (!btn) return

  if (!session) return // no logueado → deja el botón "Login" como está

  const { data: role } = await supabase.rpc('get_my_role')

  if (role === 'admin') {
    btn.textContent = 'Dashboard'
    btn.href = 'admin.html'
  } else {
    btn.textContent = 'Mi cuenta'
    btn.href = '#'
  }
}

initNav()
