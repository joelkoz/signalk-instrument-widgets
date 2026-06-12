// Shared runtime for instrument widgets: host connection, per-instance
// configuration, Signal K value subscription, unit conversion, and the
// press-and-hold gesture that asks the host to open the configuration panel.
// (Pointer events inside a sandboxed iframe are invisible to the host, so the
// gesture is detected here and delivered via the ui.openConfigPanel method.)

import { connectExtension } from 'signalk-plotterext-bus/extension'

export const CONVERSIONS = {
  none: { label: 'Raw value', units: '', fn: (v) => v },
  'ms-kn': { label: 'm/s → knots', units: 'kn', fn: (v) => v * 1.943844 },
  'ms-kmh': { label: 'm/s → km/h', units: 'km/h', fn: (v) => v * 3.6 },
  'ms-mph': { label: 'm/s → mph', units: 'mph', fn: (v) => v * 2.236936 },
  'k-c': { label: 'K → °C', units: '°C', fn: (v) => v - 273.15 },
  'k-f': {
    label: 'K → °F',
    units: '°F',
    fn: (v) => (v - 273.15) * 1.8 + 32
  },
  'rad-deg': {
    label: 'rad → °',
    units: '°',
    fn: (v) => (v * 180) / Math.PI
  },
  'ratio-pct': { label: 'ratio → %', units: '%', fn: (v) => v * 100 },
  'm-ft': { label: 'm → ft', units: 'ft', fn: (v) => v * 3.28084 },
  'm-nm': { label: 'm → nm', units: 'nm', fn: (v) => v / 1852 },
  'm-km': { label: 'm → km', units: 'km', fn: (v) => v / 1000 },
  'pa-hpa': { label: 'Pa → hPa', units: 'hPa', fn: (v) => v / 100 }
}

export function convert(value, conversionKey) {
  const conv = CONVERSIONS[conversionKey] ?? CONVERSIONS.none
  return typeof value === 'number' ? conv.fn(value) : value
}

export function conversionUnits(conversionKey) {
  return (CONVERSIONS[conversionKey] ?? CONVERSIONS.none).units
}

export function formatValue(value, decimals = 1) {
  if (typeof value !== 'number' || !isFinite(value)) return '--'
  return value.toFixed(decimals)
}

const LONG_PRESS_MS = 600

function installLongPress(client) {
  let timer = null
  let fired = false
  const start = () => {
    fired = false
    timer = setTimeout(() => {
      fired = true
      client.call('ui.openConfigPanel').catch(() => {})
    }, LONG_PRESS_MS)
  }
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  window.addEventListener('pointerdown', start)
  window.addEventListener('pointerup', cancel)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('pointerleave', cancel)
  return () => fired
}

/**
 * Connect, load per-instance config, follow config changes and the
 * configured Signal K path. Calls onUpdate({ config, value, client }) on
 * every change. Returns { client, longPressFired } once connected.
 */
export async function startInstrument({ defaults = {}, onUpdate }) {
  const client = await connectExtension()
  const longPressFired = installLongPress(client)

  let config = { ...defaults }
  let value
  let unsubscribeSk = null

  const emit = () => onUpdate({ config, value, client })

  async function applyConfig() {
    const stored = await client.state.get()
    config = { ...defaults, ...stored }
    value = undefined
    if (unsubscribeSk) {
      const u = unsubscribeSk
      unsubscribeSk = null
      await u().catch(() => {})
    }
    emit()
    if (config.path) {
      unsubscribeSk = await client.signalk.subscribe([config.path], (ev) => {
        value = ev.value
        emit()
      })
    }
  }

  await client.subscribe(['state.changed'], () => {
    applyConfig().catch((err) => console.warn('config reload failed', err))
  })
  await applyConfig()
  return { client, longPressFired }
}
