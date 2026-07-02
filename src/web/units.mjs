// Unit-aware conversion selection and display resolution. Pure logic (no DOM,
// no bus) so it can be unit tested with node --test.
//
// Three sources decide how a value is shown, in descending authority:
//   1. A per-widget conversion the user explicitly picked in the config panel
//      (a CONVERSIONS key) — the ultimate authority, never overridden.
//   2. The server's per-path display preference (`meta.displayUnits`), part of
//      the Signal K Unit Preferences system: the user's chosen unit, a
//      conversion formula, and a symbol, published per path.
//   3. A fallback heuristic combining the path's SK base unit (`meta.units`)
//      with the host's coarse category preferences (`units.get`).
// The default per-widget setting is "use default" (USE_DEFAULT), which means
// "consult 2, then 3" — so an unconfigured widget follows the user's
// server-defined display preferences automatically.

/** Per-widget setting meaning "follow the server / host preference, not a
 *  hard-coded conversion". The default value of a widget's `convert` field. */
export const USE_DEFAULT = 'default'

/** Named conversions from SK SI base units to common display units. Each holds
 *  the display symbol (`units`) and the conversion function (`fn`). Used both
 *  as explicit per-widget overrides and as the fallback when the server
 *  publishes no `displayUnits` for a path. */
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

/** Conversion keys (see CONVERSIONS) valid per SK meta unit. */
export const VALID_BY_UNIT = {
  'm/s': ['none', 'ms-kn', 'ms-kmh', 'ms-mph'],
  K: ['none', 'k-c', 'k-f'],
  rad: ['none', 'rad-deg'],
  ratio: ['none', 'ratio-pct'],
  m: ['none', 'm-ft', 'm-nm', 'm-km'],
  Pa: ['none', 'pa-hpa']
}

/**
 * Conversion keys to offer for a path. Unknown/missing meta units offer
 * everything (the user knows best when the server provides no metadata).
 */
export function validConversions(units, allKeys) {
  return (units && VALID_BY_UNIT[units]) || allKeys
}

/**
 * The fallback conversion for a path when the server publishes no
 * `displayUnits`, combining its SK meta units with the host's preferred
 * display units (may be null when the host lacks the `units` capability).
 *
 * Metre-unit paths are ambiguous (depth vs. trip distance vs. lengths), so
 * the path name picks which preference applies.
 */
export function defaultConversion(units, path, prefs) {
  switch (units) {
    case 'm/s': {
      const speed = prefs?.speed
      if (speed === 'km/h') return 'ms-kmh'
      if (speed === 'mph') return 'ms-mph'
      if (speed === 'm/s') return 'none'
      return 'ms-kn'
    }
    case 'K':
      return prefs?.temperature === 'F' ? 'k-f' : 'k-c'
    case 'rad':
      return 'rad-deg'
    case 'ratio':
      return 'ratio-pct'
    case 'Pa':
      return 'pa-hpa'
    case 'm': {
      const p = path ?? ''
      if (/depth/i.test(p)) {
        return prefs?.depth === 'foot' ? 'm-ft' : 'none'
      }
      if (/(distance|log|range)/i.test(p)) {
        return prefs?.distance === 'naut-mile' ? 'm-nm' : 'm-km'
      }
      return prefs?.length === 'foot' ? 'm-ft' : 'none'
    }
    default:
      return 'none'
  }
}

// Compiled `meta.displayUnits.formula` expressions, cached by formula string.
// A formula is a server-provided expression in `value`, e.g. "value * 1.94384".
const formulaCache = new Map()

function compileFormula(formula) {
  if (formulaCache.has(formula)) return formulaCache.get(formula)
  let fn = null
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function('value', `"use strict"; return (${formula});`)
  } catch {
    fn = null
  }
  formulaCache.set(formula, fn)
  return fn
}

/** Apply a server `displayUnits.formula` to a value. Returns the value
 *  unchanged if it is not a finite number or the formula cannot be evaluated. */
export function applyFormula(value, formula) {
  if (typeof value !== 'number' || !isFinite(value)) return value
  const fn = compileFormula(formula)
  if (!fn) return value
  try {
    const out = fn(value)
    return typeof out === 'number' && isFinite(out) ? out : value
  } catch {
    return value
  }
}

/**
 * Resolve how to display a value for a widget, honouring the authority order
 * described at the top of this file. Returns `{ value, symbol }`.
 *
 * @param {object} args
 * @param {*}      args.value    the raw value from Signal K (SI base unit)
 * @param {string} args.convert  the widget's `convert` setting (a CONVERSIONS
 *                               key, or USE_DEFAULT / undefined)
 * @param {object} [args.meta]   the path's SK metadata ({ units, displayUnits })
 * @param {object} [args.prefs]  the host's `units.get` category preferences
 * @param {string} [args.path]   the Signal K path (used by the fallback)
 * @param {string} [args.fallback] conversion key to use when the heuristic
 *                               finds nothing better (e.g. 'ratio-pct' for the
 *                               percent meter). Defaults to 'none'.
 */
export function resolveDisplay({
  value,
  convert: key,
  meta,
  prefs,
  path,
  fallback = 'none'
}) {
  // 1. Explicit per-widget conversion — the ultimate authority.
  if (key && key !== USE_DEFAULT && CONVERSIONS[key]) {
    return { value: convert(value, key), symbol: CONVERSIONS[key].units }
  }

  // 2. Server per-path display preference.
  const du = meta?.displayUnits
  if (du && (du.formula || du.symbol || du.targetUnit)) {
    return {
      value: du.formula ? applyFormula(value, du.formula) : value,
      symbol: du.symbol ?? du.targetUnit ?? ''
    }
  }

  // 3. Fallback: SK base unit + host category preference.
  let fk = defaultConversion(meta?.units, path, prefs)
  if (fk === 'none' && CONVERSIONS[fallback]) fk = fallback
  return { value: convert(value, fk), symbol: CONVERSIONS[fk].units }
}
