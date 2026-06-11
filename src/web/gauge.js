// Gauge widget: a 240-degree dial for any numeric Signal K path.

import {
  startInstrument,
  convert,
  conversionUnits,
  formatValue
} from './common.js'

const START_ANGLE = -210 // degrees; sweep 240 degrees clockwise to +30
const SWEEP = 240

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function arcPath(cx, cy, r, fromDeg, toDeg) {
  const [x1, y1] = polar(cx, cy, r, fromDeg)
  const [x2, y2] = polar(cx, cy, r, toDeg)
  const large = toDeg - fromDeg > 180 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

function render({ config, value }) {
  const root = document.getElementById('root')
  const min = Number(config.min ?? 0)
  const max = Number(config.max ?? 10)
  const decimals = Number(config.decimals ?? 1)
  const display = convert(value, config.convert)
  const units = config.units || conversionUnits(config.convert)
  const label = config.label || config.path || 'Not configured'

  let frac = 0
  if (typeof display === 'number' && isFinite(display) && max > min) {
    frac = Math.min(1, Math.max(0, (display - min) / (max - min)))
  }
  const needleDeg = START_ANGLE + SWEEP * frac

  const [nx, ny] = polar(50, 53, 38, needleDeg)
  root.innerHTML = `
  <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <path d="${arcPath(50, 53, 44, START_ANGLE, START_ANGLE + SWEEP)}"
          class="track"/>
    <path d="${arcPath(50, 53, 44, START_ANGLE, needleDeg)}" class="fill"/>
    <line x1="50" y1="53" x2="${nx.toFixed(2)}" y2="${ny.toFixed(2)}" class="needle"/>
    <circle cx="50" cy="53" r="3.2" class="hub"/>
    <text x="50" y="48" class="value">${formatValue(display, decimals)}</text>
    <text x="50" y="62" class="units">${units}</text>
    <text x="50" y="97" class="label">${label}</text>
    <text x="${polar(50, 53, 48, START_ANGLE)[0].toFixed(0)}" y="86" class="bound">${min}</text>
    <text x="${polar(50, 53, 48, START_ANGLE + SWEEP)[0].toFixed(0)}" y="86" class="bound">${max}</text>
  </svg>`
}

startInstrument({
  defaults: { min: 0, max: 10, decimals: 1, convert: 'none' },
  onUpdate: render
}).catch((err) => {
  document.getElementById('root').textContent = 'Host connection failed'
  console.error(err)
})
