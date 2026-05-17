const STYLE_ID = 'gb-ui-feedback-styles'

function ensureFeedbackStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .gb-toast-stack {
      position: fixed;
      right: clamp(14px, 2vw, 28px);
      bottom: clamp(14px, 2vw, 28px);
      z-index: 99999;
      display: grid;
      gap: 10px;
      width: min(380px, calc(100vw - 28px));
      pointer-events: none;
    }
    .gb-feedback-toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 13px 16px;
      border: 1px solid rgba(168, 85, 247, .42);
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(16, 12, 28, .94), rgba(38, 19, 62, .9));
      color: #f8f4ff;
      box-shadow: 0 18px 42px rgba(0, 0, 0, .42), 0 0 24px rgba(168, 85, 247, .18);
      backdrop-filter: blur(18px);
      font: 600 13px/1.4 "Inter", system-ui, sans-serif;
      letter-spacing: .01em;
      transform: translateY(8px);
      opacity: 0;
      animation: gbToastIn .18s ease forwards;
    }
    .gb-feedback-toast::before {
      content: "";
      width: 9px;
      height: 9px;
      flex: 0 0 auto;
      border-radius: 999px;
      background: #a855f7;
      box-shadow: 0 0 14px rgba(168, 85, 247, .9);
    }
    .gb-feedback-toast[data-type="ok"]::before { background: #22c55e; box-shadow: 0 0 14px rgba(34, 197, 94, .9); }
    .gb-feedback-toast[data-type="warn"]::before { background: #f59e0b; box-shadow: 0 0 14px rgba(245, 158, 11, .9); }
    .gb-feedback-toast[data-type="error"]::before { background: #fb7185; box-shadow: 0 0 14px rgba(251, 113, 133, .9); }
    .gb-feedback-toast.is-leaving { animation: gbToastOut .16s ease forwards; }
    .gb-confirm-overlay {
      position: fixed;
      inset: 0;
      z-index: 99998;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(4, 3, 10, .72);
      backdrop-filter: blur(14px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
    }
    .gb-confirm-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    .gb-confirm-modal {
      width: min(420px, 100%);
      border: 1px solid rgba(168, 85, 247, .42);
      border-radius: 20px;
      background: linear-gradient(145deg, rgba(14, 10, 24, .96), rgba(35, 18, 56, .94));
      box-shadow: 0 26px 80px rgba(0, 0, 0, .55), 0 0 34px rgba(168, 85, 247, .2);
      color: #f8f4ff;
      overflow: hidden;
      transform: scale(.96) translateY(8px);
      transition: transform .18s ease;
    }
    .gb-confirm-overlay.open .gb-confirm-modal { transform: scale(1) translateY(0); }
    .gb-confirm-head {
      padding: 18px 20px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, .08);
    }
    .gb-confirm-kicker {
      color: #c084fc;
      font: 800 10px/1 "Inter", system-ui, sans-serif;
      text-transform: uppercase;
      letter-spacing: .18em;
    }
    .gb-confirm-title {
      margin: 7px 0 0;
      font: 800 19px/1.2 "Inter", system-ui, sans-serif;
      letter-spacing: 0;
    }
    .gb-confirm-body {
      padding: 16px 20px 18px;
      color: rgba(248, 244, 255, .82);
      font: 500 14px/1.55 "Inter", system-ui, sans-serif;
    }
    .gb-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 0 20px 20px;
    }
    .gb-confirm-btn {
      min-height: 40px;
      padding: 0 16px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, .14);
      background: rgba(255, 255, 255, .07);
      color: #f8f4ff;
      font: 800 12px/1 "Inter", system-ui, sans-serif;
      cursor: pointer;
      transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease;
    }
    .gb-confirm-btn:hover,
    .gb-confirm-btn:focus-visible {
      transform: translateY(-1px);
      border-color: rgba(192, 132, 252, .6);
      box-shadow: 0 0 22px rgba(168, 85, 247, .18);
      outline: none;
    }
    .gb-confirm-btn.primary {
      border-color: rgba(168, 85, 247, .75);
      background: linear-gradient(135deg, #7c3aed, #c026d3);
      color: #fff;
    }
    .gb-confirm-btn.primary.danger {
      border-color: rgba(251, 113, 133, .75);
      background: linear-gradient(135deg, #be123c, #e11d48);
    }
    @keyframes gbToastIn { to { opacity: 1; transform: translateY(0); } }
    @keyframes gbToastOut { to { opacity: 0; transform: translateY(8px); } }
  `
  document.head.appendChild(style)
}

function toastStack() {
  ensureFeedbackStyles()
  let stack = document.querySelector('.gb-toast-stack')
  if (!stack) {
    stack = document.createElement('div')
    stack.className = 'gb-toast-stack'
    stack.setAttribute('aria-live', 'polite')
    stack.setAttribute('aria-relevant', 'additions')
    document.body.appendChild(stack)
  }
  return stack
}

export function showToast(message, type = 'ok', options = {}) {
  const duration = Number(options.duration || 3400)
  const el = document.createElement('div')
  el.className = 'gb-feedback-toast'
  el.dataset.type = type
  el.setAttribute('role', type === 'error' ? 'alert' : 'status')
  el.textContent = String(message || '')
  toastStack().appendChild(el)

  const remove = () => {
    el.classList.add('is-leaving')
    window.setTimeout(() => el.remove(), 180)
  }
  window.setTimeout(remove, duration)
  return el
}

export function confirmDialog(message, options = {}) {
  ensureFeedbackStyles()
  const okLabel = options.okLabel || 'Aceptar'
  const cancelLabel = options.cancelLabel || 'Cancelar'
  const title = options.title || 'Confirmar acción'
  const danger = Boolean(options.danger)

  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'gb-confirm-overlay'
    overlay.innerHTML = `
      <div class="gb-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="gb-confirm-title" aria-describedby="gb-confirm-msg">
        <div class="gb-confirm-head">
          <div class="gb-confirm-kicker">Glow Boxes</div>
          <h2 class="gb-confirm-title" id="gb-confirm-title"></h2>
        </div>
        <div class="gb-confirm-body" id="gb-confirm-msg"></div>
        <div class="gb-confirm-actions">
          <button type="button" class="gb-confirm-btn secondary" data-action="cancel"></button>
          <button type="button" class="gb-confirm-btn primary" data-action="ok"></button>
        </div>
      </div>
    `
    const titleEl = overlay.querySelector('#gb-confirm-title')
    const msgEl = overlay.querySelector('#gb-confirm-msg')
    const okBtn = overlay.querySelector('[data-action="ok"]')
    const cancelBtn = overlay.querySelector('[data-action="cancel"]')
    titleEl.textContent = title
    msgEl.textContent = String(message || '')
    okBtn.textContent = okLabel
    cancelBtn.textContent = cancelLabel
    okBtn.classList.toggle('danger', danger)

    const previousOverflow = document.body.style.overflow
    const cleanup = result => {
      overlay.classList.remove('open')
      document.removeEventListener('keydown', onKeydown)
      window.setTimeout(() => overlay.remove(), 180)
      document.body.style.overflow = previousOverflow
      resolve(result)
    }
    const onKeydown = event => {
      if (event.key === 'Escape') cleanup(false)
      if (event.key === 'Enter') cleanup(true)
    }
    const onOverlay = event => {
      if (event.target === overlay) cleanup(false)
    }

    okBtn.addEventListener('click', () => cleanup(true), { once: true })
    cancelBtn.addEventListener('click', () => cleanup(false), { once: true })
    overlay.addEventListener('click', onOverlay)
    document.addEventListener('keydown', onKeydown)
    document.body.appendChild(overlay)
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => {
      overlay.classList.add('open')
      cancelBtn.focus()
    })
  })
}
