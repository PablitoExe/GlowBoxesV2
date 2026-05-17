import { supabase } from './supabase.js'
import { ensureUserProfile } from './auth-profile.js'

const logoutButton = document.getElementById('logoutButton')

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true
    logoutButton.setAttribute('aria-busy', 'true')

    const { error } = await supabase.auth.signOut()
    if (error) {
      console.warn('No se pudo cerrar la sesion global. Se limpiara la sesion local.', error)
      await supabase.auth.signOut({ scope: 'local' })
    }

    window.location.replace('login.html')
  })
}

async function checkAdmin() {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    window.location.href = 'login.html'
    return
  }

  await ensureUserProfile(supabase, session.user)

  // Usa función security definer — no depende de políticas RLS
  const { data: role, error } = await supabase.rpc('get_my_role')

  if (error || role !== 'admin') {
    window.location.href = 'index.html'
    return
  }

  document.getElementById('app').style.display = ''

  // Rellenar nombre en sidebar
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, apellido')
    .eq('id', session.user.id)
    .single()

  const meta = session.user.user_metadata || {}
  const nombre = perfil?.nombre || meta.nombre || session.user.email
  const apellido = perfil?.apellido || meta.apellido || ''

  const nameEl = document.querySelector('.sidebar-foot .name')
  if (nameEl) nameEl.textContent = `${nombre} ${apellido}`.trim()

  const roleEl = document.querySelector('.sidebar-foot .role')
  if (roleEl) roleEl.textContent = 'Admin'

  const avatarEl = document.getElementById('sidebar-avatar')
  if (avatarEl) avatarEl.textContent = (nombre[0] + (apellido[0] || '')).toUpperCase()
}

checkAdmin()
