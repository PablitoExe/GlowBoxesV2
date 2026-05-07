import { supabase } from './supabase.js'

// ── Tab switching ──────────────────────────────────────────
const tabs        = document.querySelectorAll('.tab')
const formLogin   = document.getElementById('form-login')
const formRegister = document.getElementById('form-register')

function switchTab(target) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === target))
  formLogin.classList.toggle('hidden', target !== 'login')
  formRegister.classList.toggle('hidden', target !== 'register')
  clearError()
}

tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)))
document.querySelectorAll('[data-switch]').forEach(a => {
  a.addEventListener('click', e => { e.preventDefault(); switchTab(a.dataset.switch) })
})

// ── Error display ──────────────────────────────────────────
function showError(msg, formEl) {
  let el = formEl.querySelector('.form-error')
  if (!el) {
    el = document.createElement('div')
    el.className = 'form-error'
    formEl.querySelector('.form-subtitle').after(el)
  }
  el.textContent = msg
}
function clearError() {
  document.querySelectorAll('.form-error').forEach(e => e.remove())
}

// ── Toggle password ────────────────────────────────────────
function togglePass(id, el) {
  const input = document.getElementById(id)
  const isPass = input.type === 'password'
  input.type = isPass ? 'text' : 'password'
  el.innerHTML = isPass
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
}
window.togglePass = togglePass

// ── Password strength ──────────────────────────────────────
function checkStrength(val) {
  const bars = document.querySelectorAll('#strength .strength-bar')
  const text = document.getElementById('strength-text')
  bars.forEach(b => b.className = 'strength-bar')
  if (!val) { text.textContent = '// Seguridad: --'; return }
  let score = 0
  if (val.length >= 8)          score++
  if (/[A-Z]/.test(val))        score++
  if (/[0-9]/.test(val))        score++
  if (/[^A-Za-z0-9]/.test(val)) score++
  const labels = ['Débil','Aceptable','Buena','Excelente']
  for (let i = 0; i < score; i++) bars[i].classList.add('strength-bar', 's' + score)
  text.textContent = '// Seguridad: ' + (labels[score - 1] || '--')
}
window.checkStrength = checkStrength

// ── Helpers botón ──────────────────────────────────────────
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'

function btnLoading(btn)        { btn.disabled = true; btn.innerHTML = 'Procesando...' }
function btnSuccess(btn, label) { btn.innerHTML = `✓ ${label}`; btn.style.background = 'var(--acid)'; btn.style.color = '#000' }
function btnReset(btn, label)   { btn.disabled = false; btn.style.background = ''; btn.style.color = ''; btn.innerHTML = `${label} ${ARROW}` }

// ── LOGIN ──────────────────────────────────────────────────
async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-pass').value
  const btn      = formLogin.querySelector('.btn-submit')

  clearError()
  btnLoading(btn)

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    btnReset(btn, 'Acceder')
    showError(
      error.message.includes('Invalid') ? 'Email o contraseña incorrectos.' : error.message,
      formLogin
    )
    return
  }

  const { data: role } = await supabase.rpc('get_my_role')

  btnSuccess(btn, 'Listo')
  setTimeout(() => {
    window.location.href = role === 'admin' ? 'admin.html' : 'index.html'
  }, 700)
}

// ── REGISTER ───────────────────────────────────────────────
async function handleRegister() {
  const nombre   = document.getElementById('reg-nombre').value.trim()
  const apellido = document.getElementById('reg-apellido').value.trim()
  const email    = document.getElementById('reg-email').value.trim()
  const password = document.getElementById('reg-pass').value
  const btn      = formRegister.querySelector('.btn-submit')

  clearError()
  btnLoading(btn)

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre, apellido } }
  })

  if (error) {
    btnReset(btn, 'Crear Cuenta')
    showError(
      error.message.includes('already') ? 'Ya existe una cuenta con ese email.' : error.message,
      formRegister
    )
    return
  }

  btnSuccess(btn, 'Cuenta creada')
  setTimeout(() => { window.location.href = 'index.html' }, 700)
}

// ── Dispatcher desde HTML (onsubmit) ──────────────────────
window.handleSubmit = (type) => type === 'login' ? handleLogin() : handleRegister()

// ── Si ya hay sesión activa, saltar login ─────────────────
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = 'index.html'
})
