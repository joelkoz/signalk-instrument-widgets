// Meter widget: a horizontal 0-100% bar for ratio-style Signal K paths.

import {
  startInstrument,
  convert,
  formatValue
} from './common.js'

function render({ config, value }) {
  const root = document.getElementById('root')
  const label = config.label || config.path || 'Not configured'
  // A meter shows percent: ratio paths (0..1) use the ratio->% conversion by
  // default; paths already in percent can use 'none'.
  const display = convert(value, config.convert ?? 'ratio-pct')
  const pct =
    typeof display === 'number' && isFinite(display)
      ? Math.min(100, Math.max(0, display))
      : 0

  root.innerHTML = `
  <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
    <text x="100" y="18" class="label meter-label">${label}</text>
    <rect x="8" y="28" width="184" height="32" rx="8" class="track"/>
    <rect x="8" y="28" width="${(184 * pct) / 100}" height="32" rx="8" class="fillbar"/>
    <text x="100" y="92" class="value meter-value">${formatValue(display, Number(config.decimals ?? 0))}%</text>
  </svg>`
}

startInstrument({
  defaults: { convert: 'ratio-pct', decimals: 0 },
  onUpdate: render
}).catch((err) => {
  document.getElementById('root').textContent = 'Host connection failed'
  console.error(err)
})
