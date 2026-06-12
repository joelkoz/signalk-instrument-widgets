// Unit-aware conversion selection. Pure logic (no DOM, no bus) so it can be
// unit tested with node --test.
//
// Signal K path metadata (`meta.units`) gives the SI unit of a path; the
// host's `units.get` method (capability `units`) gives the user's preferred
// display units. Together they decide which conversions make sense for a
// selected path and which one to preselect.

/** Conversion keys (see CONVERSIONS in common.js) valid per SK meta unit. */
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
 * The conversion to preselect for a path, combining its SK meta units with
 * the host's preferred display units (may be null when the host lacks the
 * `units` capability).
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
