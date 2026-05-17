import { renderStatNumber, startPublicStatsAutoRefresh } from './site-stats.js'

function renderQuienesStats(stats) {
  document.querySelectorAll('[data-stat]').forEach(el => {
    renderStatNumber(el, stats[el.dataset.stat])
  })

  document.querySelectorAll('[data-rubro-count]').forEach(el => {
    renderStatNumber(el, stats.rubrosDetalle?.[el.dataset.rubroCount] || 0)
  })
}

startPublicStatsAutoRefresh(renderQuienesStats)
