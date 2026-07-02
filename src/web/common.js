// Shared runtime for instrument widgets: host connection, per-instance
// configuration, Signal K value subscription, unit conversion, and the
// press-and-hold gesture that asks the host to open the configuration panel.
// (Pointer events inside a sandboxed iframe are invisible to the host, so the
// gesture is detected here and delivered via the ui.openConfigPanel method.)

import { connectExtension } from 'signalk-plotterext-bus/extension'

// Unit conversion / display resolution lives in units.mjs (pure, no bus) so it
// can be unit tested. Re-exported here so widgets keep a single import surface.
export {
  CONVERSIONS,
  USE_DEFAULT,
  convert,
  conversionUnits,
  resolveDisplay
} from './units.mjs'

export function formatValue(value, decimals = 1) {
  if (typeof value !== 'number' || !isFinite(value)) return '--'
  return value.toFixed(decimals)
}

const LONG_PRESS_MS = 1500

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
 * Fetch a path's Signal K metadata (which carries `units` and the server's
 * `displayUnits` preference) over same-origin REST. The bus value stream does
 * not carry meta, so widgets read it here. Returns undefined on any failure.
 */
async function fetchMeta(path) {
  try {
    const res = await fetch(
      `/signalk/v1/api/vessels/self/${path.replace(/\./g, '/')}/meta`,
      { credentials: 'include' }
    )
    if (!res.ok) return undefined
    return await res.json()
  } catch {
    return undefined
  }
}

/** The host's coarse display-unit category preferences (capability `units`),
 *  or null when the host does not expose them. Used only as the fallback when
 *  the server publishes no per-path `displayUnits`. */
async function fetchPrefs(client) {
  if (!client.hasCapability('units')) return null
  try {
    const r = await client.call('units.get')
    return r?.units ?? null
  } catch {
    return null
  }
}

/**
 * Connect, load per-instance config, follow config changes and the
 * configured Signal K path. Calls onUpdate({ config, value, meta, prefs,
 * client }) on every change. Returns { client, longPressFired } once
 * connected.
 */
export async function startInstrument({ defaults = {}, onUpdate }) {
  const client = await connectExtension()
  const longPressFired = installLongPress(client)
  const prefs = await fetchPrefs(client)

  let config = { ...defaults }
  let value
  let meta
  let unsubscribeSk = null

  const emit = () => onUpdate({ config, value, meta, prefs, client })

  async function applyConfig() {
    const stored = await client.state.get()
    config = { ...defaults, ...stored }
    value = undefined
    meta = undefined
    if (unsubscribeSk) {
      const u = unsubscribeSk
      unsubscribeSk = null
      await u().catch(() => {})
    }
    emit()
    if (config.path) {
      meta = await fetchMeta(config.path)
      emit()
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
