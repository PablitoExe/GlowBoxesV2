import { supabase } from './supabase.js'

// ── Auth state ────────────────────────────────────────────
async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  const btn = document.getElementById('nav-login-btn')
  if (!btn) return

  if (!session) return

  const { data: role } = await supabase.rpc('get_my_role')
  if (role === 'admin') {
    btn.textContent = 'Dashboard'
    btn.href = 'admin.html'
  } else {
    btn.textContent = 'Mi cuenta'
    btn.href = '#'
  }
}

// ── Sticky nav on scroll ──────────────────────────────────
function initSticky() {
  const nav = document.getElementById('main-nav')
  if (!nav) return
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40)
  }, { passive: true })
}

// ── Search overlay ────────────────────────────────────────
function initSearch() {
  const overlay = document.getElementById('search-overlay')
  const input   = document.getElementById('search-input')
  const btnOpen = document.getElementById('btn-search')
  const btnClose = document.getElementById('search-close')
  if (!overlay || !btnOpen) return

  function openSearch() {
    overlay.classList.add('open')
    setTimeout(() => input?.focus(), 80)
    document.body.style.overflow = 'hidden'
  }
  function closeSearch() {
    overlay.classList.remove('open')
    document.body.style.overflow = ''
    if (input) input.value = ''
  }

  btnOpen.addEventListener('click', openSearch)
  btnClose?.addEventListener('click', closeSearch)
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSearch() })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch() })
}

// ── Mobile hamburger ──────────────────────────────────────
function initHamburger() {
  const hamburger = document.getElementById('hamburger')
  const navLinks  = document.getElementById('nav-links')
  const overlay   = document.getElementById('nav-overlay')
  if (!hamburger || !navLinks) return

  function openMenu() {
    hamburger.classList.add('open')
    navLinks.classList.add('open')
    overlay.classList.add('open')
    document.body.style.overflow = 'hidden'
  }
  function closeMenu() {
    hamburger.classList.remove('open')
    navLinks.classList.remove('open')
    overlay.classList.remove('open')
    document.body.style.overflow = ''
  }

  hamburger.addEventListener('click', () => {
    hamburger.classList.contains('open') ? closeMenu() : openMenu()
  })
  overlay.addEventListener('click', closeMenu)

  // Close when a link is clicked
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu))
}

// ── Smooth scroll + active link ───────────────────────────
function initSmoothScroll() {
  const links = document.querySelectorAll('a.nav-link')

  function setActive(href) {
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === href))
  }

  links.forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href')
      const id   = href.slice(1)

      // Activar inmediatamente al hacer clic
      setActive(href)

      const target = document.getElementById(id)
      if (!target) return
      e.preventDefault()
      const top = target.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top, behavior: 'smooth' })
    })
  })

  // Actualizar activo según posición de scroll (solo secciones que existen)
  const sections = ['productos', 'categorias', 'marcas']
    .map(id => document.getElementById(id))
    .filter(Boolean)

  if (!sections.length) return

  function updateActive() {
    const scrollY = window.scrollY + 150
    let current = sections[0]
    sections.forEach(s => {
      const top = s.getBoundingClientRect().top + window.scrollY
      if (scrollY >= top) current = s
    })
    setActive('#' + current.id)
  }

  window.addEventListener('scroll', updateActive, { passive: true })
  updateActive()
}

// ── Init ──────────────────────────────────────────────────
initAuth()
initSticky()
initSearch()
initHamburger()
initSmoothScroll()
