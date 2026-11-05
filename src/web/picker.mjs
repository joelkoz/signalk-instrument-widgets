// Pure helpers for the touch-first configuration panel: browsing Signal K
// paths one segment at a time, and stepping numbers without a keyboard. No DOM
// and no bus, so they can be unit tested with node --test.

/**
 * The entries one level below `prefix` ('' = the top level) among `paths`:
 * groups (a segment that has deeper paths below it, with how many) first,
 * then leaves (complete paths), each sorted by name.
 */
export function childrenAt(paths, prefix) {
  const head = prefix ? `${prefix}.` : ''
  const groups = new Map()
  const leaves = []
  for (const path of paths) {
    if (!path.startsWith(head)) continue
    const rest = path.slice(head.length)
    const dot = rest.indexOf('.')
    if (dot === -1) {
      leaves.push({ key: rest, path })
    } else {
      const key = rest.slice(0, dot)
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }
  }
  const byKey = (a, b) => a.key.localeCompare(b.key)
  return {
    groups: [...groups]
      .map(([key, count]) => ({ key, path: head + key, count }))
      .sort(byKey),
    leaves: leaves.sort(byKey)
  }
}

/**
 * Where browsing lands when the user opens `prefix`: a group holding nothing
 * but one deeper group is skipped, so a chain like `electrical.batteries` with
 * a single bank takes one tap instead of several.
 */
export function settle(paths, prefix) {
  let current = prefix
  for (;;) {
    const { groups, leaves } = childrenAt(paths, current)
    if (groups.length !== 1 || leaves.length !== 0) return current
    current = groups[0].path
  }
}

/** The parent of a path ('' for a top-level path). */
export function parentOf(path) {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? '' : path.slice(0, dot)
}

/** Breadcrumb trail for `prefix`: [{ key, path }] from the top down. */
export function crumbs(prefix) {
  if (!prefix) return []
  const parts = prefix.split('.')
  return parts.map((key, i) => ({ key, path: parts.slice(0, i + 1).join('.') }))
}

/**
 * A round step (1, 2 or 5 times a power of ten) that crosses `span` in about
 * twenty taps, so a 0-3000 rpm range and a 0-1 ratio range both adjust in a
 * sensible number of presses.
 */
export function niceStep(span) {
  if (!(span > 0) || !isFinite(span)) return 1
  const raw = span / 20
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const n = raw / magnitude
  const factor = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10
  return factor * magnitude
}

/**
 * The next point on the `step` grid from `value` in `direction` (+1 / -1). A
 * value between grid points moves to the nearest one on that side, and the
 * result carries no floating-point residue (0.1 + 0.2 stays 0.3).
 */
export function stepValue(value, step, direction) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const units = Number((value / step).toFixed(6))
  const next = direction > 0 ? Math.floor(units) + 1 : Math.ceil(units) - 1
  return Number((next * step).toFixed(decimals))
}

/** Values people put on an instrument most, with the abbreviation instruments use. */
export const QUICK_PICKS = [
  { path: 'navigation.speedOverGround', label: 'SOG', title: 'Speed over ground' },
  { path: 'navigation.speedThroughWater', label: 'STW', title: 'Speed through water' },
  { path: 'navigation.courseOverGroundTrue', label: 'COG', title: 'Course over ground' },
  { path: 'navigation.headingTrue', label: 'HDG', title: 'Heading' },
  { path: 'environment.depth.belowTransducer', label: 'Depth', title: 'Depth' },
  { path: 'environment.wind.speedApparent', label: 'AWS', title: 'Apparent wind speed' },
  { path: 'environment.wind.angleApparent', label: 'AWA', title: 'Apparent wind angle' },
  { path: 'environment.wind.speedTrue', label: 'TWS', title: 'True wind speed' },
  { path: 'environment.wind.angleTrueWater', label: 'TWA', title: 'True wind angle' },
  { path: 'environment.wind.directionTrue', label: 'TWD', title: 'True wind direction' },
  { path: 'environment.outside.pressure', label: 'Baro', title: 'Air pressure' },
  { path: 'environment.outside.temperature', label: 'Air', title: 'Air temperature' },
  { path: 'environment.water.temperature', label: 'Water', title: 'Water temperature' }
]

/** The quick picks this server actually has a value for, in their fixed order. */
export function quickPicks(paths) {
  const present = new Set(paths)
  return QUICK_PICKS.filter((q) => present.has(q.path))
}
