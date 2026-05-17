const ARG_TZ = 'America/Argentina/Buenos_Aires'
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const SCHEDULE = {
  1: { label: '9:00 — 19:00', open: 9 * 60, close: 19 * 60 },
  2: { label: '9:00 — 19:00', open: 9 * 60, close: 19 * 60 },
  3: { label: '9:00 — 19:00', open: 9 * 60, close: 19 * 60 },
  4: { label: '9:00 — 19:00', open: 9 * 60, close: 19 * 60 },
  5: { label: '9:00 — 19:00', open: 9 * 60, close: 19 * 60 },
  6: { label: '10:00 — 16:00', open: 10 * 60, close: 16 * 60 },
  0: { label: 'Cerrado', open: null, close: null },
}

function argentinaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ARG_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const hour = Number(byType.hour === '24' ? 0 : byType.hour)
  const minute = Number(byType.minute)

  return {
    day: dayMap[byType.weekday] ?? 0,
    minutes: hour * 60 + minute,
  }
}

function renderOpenStatus() {
  try {
    const statusEl = document.getElementById('open-status')
    const rowEl = document.getElementById('today-hours-row')
    const dayEl = document.getElementById('today-day-label')
    const hoursEl = document.getElementById('today-hours-label')
    if (!statusEl || !rowEl || !dayEl || !hoursEl) return

    const now = argentinaParts()
    const schedule = SCHEDULE[now.day] || SCHEDULE[0]
    const isOpen = schedule.open !== null && now.minutes >= schedule.open && now.minutes < schedule.close

    dayEl.textContent = `Hoy · ${DAYS[now.day]}`
    hoursEl.textContent = schedule.label
    rowEl.classList.add('today')
    rowEl.classList.toggle('closed', !isOpen)

    statusEl.textContent = isOpen ? 'ABIERTO AHORA' : 'CERRADO'
    statusEl.classList.toggle('live', isOpen)
    statusEl.classList.toggle('closed', !isOpen)
    statusEl.title = `Horario Argentina · ${DAYS[now.day]} · ${schedule.label}`
  } catch (error) {
    console.error('[contacto] Error actualizando horario.', error)
  }
}

renderOpenStatus()
window.setInterval(renderOpenStatus, 60000)
