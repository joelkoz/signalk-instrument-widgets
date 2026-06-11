// Switch widget: displays a boolean/0-1 Signal K path and actuates it with
// signalk.put on tap. A short tap toggles; a long press opens configuration
// (handled by the shared runtime).

import { startInstrument } from './common.js'

let current = { config: {}, value: undefined, client: null }
let longPressFired = () => false

function isOn(value) {
  return value === true || value === 1 || value === '1' || value === 'on'
}

function render({ config, value, client }) {
  current = { config, value, client }
  const root = document.getElementById('root')
  const label = config.label || config.path || 'Not configured'
  const on = isOn(value)
  const known = value !== undefined && value !== null
  root.innerHTML = `
  <div class="switch ${known ? (on ? 'on' : 'off') : 'unknown'}">
    <div class="switch-pill"><div class="switch-knob"></div></div>
    <div class="switch-state">${known ? (on ? 'ON' : 'OFF') : '--'}</div>
    <div class="switch-label">${label}</div>
  </div>`
}

window.addEventListener('pointerup', () => {
  // Ignore the tap when it was actually a long press (config gesture).
  if (longPressFired()) return
  const { config, value, client } = current
  if (!client || !config.path) return
  if (!client.hasCapability('signalk.put')) return
  client.signalk.put(config.path, isOn(value) ? 0 : 1).catch((err) => {
    console.warn('switch PUT failed', err)
  })
})

startInstrument({ defaults: {}, onUpdate: render })
  .then((started) => {
    longPressFired = started.longPressFired
  })
  .catch((err) => {
    document.getElementById('root').textContent = 'Host connection failed'
    console.error(err)
  })
