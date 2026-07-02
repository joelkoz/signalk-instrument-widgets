// Configuration panel. Opened by the host with context.targetInstance set to
// the widget instance being configured (and context.targetWidget naming the
// widget type). Reads/writes that instance's state; the widget re-renders
// live via the host's state.changed event.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import { CONVERSIONS, USE_DEFAULT } from './common.js'
import { validConversions } from './units.mjs'

const NUMERIC = 'numeric'
const BOOLEAN = 'boolean'

const WIDGET_FIELDS = {
  gauge: { pathKind: NUMERIC, fields: ['label', 'convert', 'min', 'max', 'decimals'] },
  meter: { pathKind: NUMERIC, fields: ['label', 'convert', 'decimals'] },
  switch: { pathKind: BOOLEAN, fields: ['label'] },
  display: {
    pathKind: NUMERIC,
    fields: ['topLabel', 'bottomLabel', 'convert', 'decimals']
  }
}

/** Flatten the Signal K full tree into [path, value, metaUnits] leaves. */
function flattenTree(node, prefix = '', out = []) {
  if (node === null || typeof node !== 'object') return out
  if ('value' in node && (typeof node.value !== 'object' || node.value === null)) {
    out.push([prefix, node.value, node.meta?.units])
    return out
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'meta' || key === 'timestamp' || key === '$source' || key === 'values') {
      continue
    }
    flattenTree(child, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}

function kindOf(value) {
  if (typeof value === 'number') return NUMERIC
  if (typeof value === 'boolean') return BOOLEAN
  return null
}

/**
 * Candidate paths for a widget kind, plus a path -> SK meta units map used
 * for unit-aware conversion selection.
 */
async function fetchPaths(pathKind) {
  const res = await fetch('/signalk/v1/api/vessels/self', {
    credentials: 'include'
  })
  if (!res.ok) throw new Error(`vessels/self fetch failed: ${res.status}`)
  const tree = await res.json()
  const leaves = flattenTree(tree)
  const paths = []
  const unitsByPath = {}
  for (const [path, value, metaUnits] of leaves) {
    if (metaUnits) unitsByPath[path] = metaUnits
    const kind = kindOf(value)
    if (kind === pathKind) paths.push(path)
    // Switch-style paths are numeric 0/1 on the wire; offer them for
    // boolean widgets too.
    if (
      pathKind === BOOLEAN &&
      kind === NUMERIC &&
      /(switches|\.state$)/.test(path)
    ) {
      paths.push(path)
    }
  }
  return { paths: [...new Set(paths)].sort(), unitsByPath }
}

function fieldRow(id, label, control) {
  return `<label class="row"><span>${label}</span>${control}</label>`
}

function buildForm(widgetType, paths, state) {
  const spec = WIDGET_FIELDS[widgetType] ?? WIDGET_FIELDS.gauge
  const rows = []
  rows.push(
    fieldRow(
      'path',
      'Signal K path',
      `<input id="path" list="paths" value="${state.path ?? ''}" placeholder="Type to search...">
       <datalist id="paths">${paths.map((p) => `<option value="${p}">`).join('')}</datalist>`
    )
  )
  if (spec.fields.includes('label')) {
    rows.push(
      fieldRow('label', 'Label', `<input id="label" value="${state.label ?? ''}" placeholder="Display name">`)
    )
  }
  if (spec.fields.includes('topLabel')) {
    rows.push(
      fieldRow(
        'topLabel',
        'Top label',
        `<input id="topLabel" value="${state.topLabel ?? ''}" placeholder="Small title (blank = hidden)">`
      )
    )
  }
  if (spec.fields.includes('bottomLabel')) {
    rows.push(
      fieldRow(
        'bottomLabel',
        'Bottom label',
        `<input id="bottomLabel" value="${state.bottomLabel ?? ''}" placeholder="Large label (blank = hidden)">`
      )
    )
  }
  if (spec.fields.includes('convert')) {
    rows.push(
      fieldRow('convert', 'Units', `<select id="convert"></select>`)
    )
  }
  if (spec.fields.includes('min')) {
    rows.push(fieldRow('min', 'Minimum', `<input id="min" type="number" step="any" value="${state.min ?? 0}">`))
    rows.push(fieldRow('max', 'Maximum', `<input id="max" type="number" step="any" value="${state.max ?? 10}">`))
  }
  if (spec.fields.includes('decimals')) {
    rows.push(
      fieldRow('decimals', 'Decimals', `<input id="decimals" type="number" min="0" max="4" value="${state.decimals ?? 1}">`)
    )
  }
  return rows.join('')
}

function readForm(widgetType) {
  const spec = WIDGET_FIELDS[widgetType] ?? WIDGET_FIELDS.gauge
  const get = (id) => document.getElementById(id)
  const values = { path: get('path').value.trim() }
  if (spec.fields.includes('label')) values.label = get('label').value.trim()
  if (spec.fields.includes('topLabel')) {
    values.topLabel = get('topLabel').value.trim()
  }
  if (spec.fields.includes('bottomLabel')) {
    values.bottomLabel = get('bottomLabel').value.trim()
  }
  if (spec.fields.includes('convert')) values.convert = get('convert').value
  if (spec.fields.includes('min')) {
    values.min = Number(get('min').value)
    values.max = Number(get('max').value)
  }
  if (spec.fields.includes('decimals')) {
    values.decimals = Number(get('decimals').value)
  }
  return values
}

/**
 * Repopulate the conversion select for the currently entered path. The default,
 * always-offered choice is "Server default", which lets the widget follow the
 * user's server-defined display preference (`meta.displayUnits`) at render
 * time — so most widgets never need this changed. The explicit conversions
 * below it are per-widget overrides, filtered to those valid for the path's SK
 * meta units. A previously saved choice is kept while its path is selected.
 */
function refreshConversionOptions(unitsByPath, savedPath, savedConvert) {
  const select = document.getElementById('convert')
  if (!select) return
  const path = document.getElementById('path').value.trim()
  const units = unitsByPath[path]
  const valid = validConversions(units, Object.keys(CONVERSIONS))
  const keep =
    path === savedPath &&
    savedConvert &&
    (savedConvert === USE_DEFAULT || valid.includes(savedConvert))
  const selected = keep ? savedConvert : USE_DEFAULT
  const options = [
    `<option value="${USE_DEFAULT}" ${selected === USE_DEFAULT ? 'selected' : ''}>Server default</option>`,
    ...valid.map(
      (key) =>
        `<option value="${key}" ${key === selected ? 'selected' : ''}>${CONVERSIONS[key].label}</option>`
    )
  ]
  select.innerHTML = options.join('')
}

async function main() {
  const root = document.getElementById('root')
  const client = await connectExtension()
  const widgetType = client.context.targetWidget ?? 'gauge'
  const spec = WIDGET_FIELDS[widgetType] ?? WIDGET_FIELDS.gauge

  root.innerHTML = '<p class="status">Loading Signal K paths…</p>'
  const [{ paths, unitsByPath }, state] = await Promise.all([
    fetchPaths(spec.pathKind).catch(() => ({ paths: [], unitsByPath: {} })),
    client.state.get()
  ])

  root.innerHTML = `
    <h2>Configure ${widgetType}</h2>
    <form id="form">${buildForm(widgetType, paths, state)}</form>
    <p class="status" id="status"></p>
    <div class="actions">
      <button type="button" id="cancel">Cancel</button>
      <button type="button" id="save" class="primary">Save</button>
    </div>`

  if (spec.fields.includes('convert')) {
    const refresh = () =>
      refreshConversionOptions(unitsByPath, state.path, state.convert)
    refresh()
    const pathInput = document.getElementById('path')
    pathInput.addEventListener('change', refresh)
    pathInput.addEventListener('input', () => {
      // datalist picks fire 'input'; only react once the value is a known path
      if (unitsByPath[pathInput.value.trim()] !== undefined) refresh()
    })
  }

  const status = document.getElementById('status')
  document.getElementById('save').addEventListener('click', async () => {
    try {
      await client.state.set(readForm(widgetType))
      status.textContent = 'Saved.'
      await client.call('ui.closePanel').catch(() => {})
    } catch (err) {
      status.textContent = `Save failed: ${err.message}`
    }
  })
  document.getElementById('cancel').addEventListener('click', () => {
    client.call('ui.closePanel').catch(() => {})
  })
}

main().catch((err) => {
  document.getElementById('root').textContent = `Host connection failed: ${err.message}`
  console.error(err)
})
