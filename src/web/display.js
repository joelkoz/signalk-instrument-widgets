// Display Value widget: a centered three-row text readout. Small top label,
// large value in the middle, larger bottom label. Blank labels collapse.
// Example: top "Speed over ground", middle the live value, bottom "SOG".

import {
  startInstrument,
  resolveDisplay,
  USE_DEFAULT,
  formatValue
} from './common.js'

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )
}

function render({ config, value, meta, prefs }) {
  const root = document.getElementById('root')
  const { value: display, symbol } = resolveDisplay({
    value,
    convert: config.convert,
    meta,
    prefs,
    path: config.path
  })
  const units = config.units || symbol
  let text
  if (value === undefined || value === null) {
    text = '--'
  } else if (typeof display === 'number') {
    text = formatValue(display, Number(config.decimals ?? 1))
  } else {
    text = String(display)
  }
  const configured = !!config.path
  const rows = []
  if (config.topLabel) {
    rows.push(`<div class="display-top">${esc(config.topLabel)}</div>`)
  }
  rows.push(
    `<div class="display-value">${esc(text)}${
      units ? `<span class="display-units">${esc(units)}</span>` : ''
    }</div>`
  )
  if (config.bottomLabel) {
    rows.push(`<div class="display-bottom">${esc(config.bottomLabel)}</div>`)
  }
  if (!configured) {
    rows.push('<div class="display-bottom">Not configured</div>')
  }
  root.innerHTML = `<div class="display">${rows.join('')}</div>`
}

startInstrument({
  defaults: { convert: USE_DEFAULT, decimals: 1, topLabel: '', bottomLabel: '' },
  onUpdate: render
}).catch((err) => {
  document.getElementById('root').textContent = 'Host connection failed'
  console.error(err)
})
