function splitFullName(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return {
    nombre: parts.shift() || '',
    apellido: parts.join(' '),
  }
}

function profileFromUser(user) {
  const meta = user?.user_metadata || {}
  const fullName = meta.full_name || meta.name || ''
  const fallbackName = splitFullName(fullName)

  return {
    id: user.id,
    email: user.email || null,
    nombre: meta.nombre || meta.given_name || fallbackName.nombre || '',
    apellido: meta.apellido || meta.family_name || fallbackName.apellido || '',
    avatar_url: meta.avatar_url || meta.picture || null,
  }
}

function canRetryWithoutEmail(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return error?.code === 'PGRST204' || (message.includes('email') && message.includes('schema'))
}

async function fetchExistingProfile(supabase, userId) {
  let { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, apellido, email, avatar_url, role')
    .eq('id', userId)
    .maybeSingle()

  if (error && canRetryWithoutEmail(error)) {
    const retry = await supabase
      .from('perfiles')
      .select('id, nombre, apellido, avatar_url, role')
      .eq('id', userId)
      .maybeSingle()
    data = retry.data
    error = retry.error
  }

  if (error) throw error
  return data
}

export async function ensureUserProfile(supabase, user) {
  if (!supabase || !user?.id) return null

  const profile = profileFromUser(user)
  let existing = null
  try {
    existing = await fetchExistingProfile(supabase, user.id)
  } catch (error) {
    console.warn('[AUTH PROFILE] No se pudo leer el perfil existente antes de sincronizar.', error)
  }

  const payload = {
    id: profile.id,
    email: profile.email || existing?.email || null,
    nombre: existing?.nombre || profile.nombre,
    apellido: existing?.apellido || profile.apellido,
    avatar_url: profile.avatar_url || existing?.avatar_url || null,
  }

  const upsertOptions = { onConflict: 'id' }
  let { data, error } = await supabase
    .from('perfiles')
    .upsert(payload, upsertOptions)
    .select('id, nombre, apellido, email, avatar_url, role')
    .single()

  if (error && canRetryWithoutEmail(error)) {
    const { email, ...legacyProfile } = payload
    console.warn('[AUTH PROFILE] La columna perfiles.email no está disponible todavía. Aplicá la migración Google OAuth para sincronizar email.', error)
    const retry = await supabase
      .from('perfiles')
      .upsert(legacyProfile, upsertOptions)
      .select('id, nombre, apellido, avatar_url, role')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error('[AUTH PROFILE ERROR]', error)
    return null
  }

  return data
}
