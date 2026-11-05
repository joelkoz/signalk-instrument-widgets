// Configuration panel. Opened by the host with context.targetInstance set to
// the widget instance being configured (and context.targetWidget naming the
// widget type). Reads/writes that instance's state; the widget re-renders
// live via the host's state.changed event.
//
// The panel is built for a touchscreen at the helm: the path is chosen by
// tapping through its groups, units are buttons and numbers have +/- steppers,
// so nothing but the optional labels needs a keyboard.

import { connectExtension } from 'signalk-plotterext-bus/extension'
import { CONVERSIONS, USE_DEFAULT, formatValue } from './common.js'
import { validConversions } from './units.mjs'
import {
  childrenAt,
  settle,
  parentOf,
  crumbs,
  niceStep,
  stepValue,
  quickPicks
} from './picker.mjs'

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

const TEXT_FIELDS = {
  label: { title: 'Label', placeholder: 'Display name (blank = path)' },
  topLabel: { title: 'Top label', placeholder: 'Small title (blank = hidden)' },
  bottomLabel: {
    title: 'Bottom label',
    placeholder: 'Large label (blank = hidden)'
  }
}

const MAX_DECIMALS = 4
const REPEAT_DELAY_MS = 450
const REPEAT_INTERVAL_MS = 90

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
 * Candidate paths for a widget kind, plus path -> SK meta units (for
 * unit-aware conversion selection) and path -> current value (shown beside
 * each path so the user can tell which tank or battery it is).
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
  const valueByPath = {}
  for (const [path, value, metaUnits] of leaves) {
    if (metaUnits) unitsByPath[path] = metaUnits
    valueByPath[path] = value
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
  return { paths: [...new Set(paths)].sort(), unitsByPath, valueByPath }
}

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function rawValueText(value, units) {
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (typeof value !== 'number') return ''
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 2 : 3
  return `${formatValue(value, digits)}${units ? ` ${units}` : ''}`
}

/**
 * Conversion choices for a path. The default, always-offered choice is
 * "Server default", which lets the widget follow the user's server-defined
 * display preference (`meta.displayUnits`) at render time — so most widgets
 * never need this changed. The explicit conversions after it are per-widget
 * overrides, filtered to those valid for the path's SK meta units.
 */
function conversionChoices(units) {
  return [
    { key: USE_DEFAULT, label: 'Server default' },
    ...validConversions(units, Object.keys(CONVERSIONS)).map((key) => ({
      key,
      label: CONVERSIONS[key].label
    }))
  ]
}

/** Run `action` on press, then repeatedly while the button is held. */
function repeatWhileHeld(button, action) {
  let delay = null
  let interval = null
  const stop = () => {
    clearTimeout(delay)
    clearInterval(interval)
    delay = interval = null
  }
  button.addEventListener('pointerdown', (ev) => {
    ev.preventDefault()
    stop()
    action()
    delay = setTimeout(() => {
      interval = setInterval(action, REPEAT_INTERVAL_MS)
    }, REPEAT_DELAY_MS)
  })
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
    button.addEventListener(type, stop)
  }
  // Keyboard activation produces a click with no pointer press before it.
  button.addEventListener('click', (ev) => {
    if (ev.detail === 0) action()
  })
}

async function main() {
  const root = document.getElementById('root')
  const client = await connectExtension()
  const widgetType = client.context.targetWidget ?? 'gauge'
  const spec = WIDGET_FIELDS[widgetType] ?? WIDGET_FIELDS.gauge
  const has = (field) => spec.fields.includes(field)

  root.innerHTML = '<p class="status">Loading Signal K paths…</p>'
  const [{ paths, unitsByPath, valueByPath }, state] = await Promise.all([
    fetchPaths(spec.pathKind).catch(() => ({
      paths: [],
      unitsByPath: {},
      valueByPath: {}
    })),
    client.state.get()
  ])

  const draft = {
    path: state.path ?? '',
    convert: state.convert ?? USE_DEFAULT,
    min: Number(state.min ?? 0),
    max: Number(state.max ?? 10),
    decimals: Number(state.decimals ?? 1)
  }
  let browsing = settle(paths, draft.path ? parentOf(draft.path) : '')
  const quick = quickPicks(paths)

  const textRows = Object.entries(TEXT_FIELDS)
    .filter(([id]) => has(id))
    .map(
      ([id, { title, placeholder }]) => `
      <label class="row"><span>${title}</span>
        <input id="${id}" value="${esc(state[id] ?? '')}" placeholder="${placeholder}">
      </label>`
    )
    .join('')
  const stepperRow = (id, title) => `
    <div class="row"><span>${title}</span>
      <div class="stepper" data-field="${id}">
        <button type="button" class="step" data-dir="-1" aria-label="Decrease ${title}">−</button>
        <output id="${id}"></output>
        <button type="button" class="step" data-dir="1" aria-label="Increase ${title}">+</button>
      </div>
    </div>`

  root.innerHTML = `
    <h2>Configure ${widgetType}</h2>
    <section class="picker">
      <div class="field-title">Signal K path</div>
      ${quick.length ? '<div class="choices" id="quick"></div>' : ''}
      <div class="picked" id="picked"></div>
      <nav class="crumbs" id="crumbs"></nav>
      <div class="browse" id="browse"></div>
    </section>
    <section class="settings">
      ${textRows}
      ${has('convert') ? '<div class="field-title">Units</div><div class="choices" id="convert"></div>' : ''}
      ${has('min') ? stepperRow('min', 'Minimum') + stepperRow('max', 'Maximum') : ''}
      ${has('decimals') ? stepperRow('decimals', 'Decimals') : ''}
    </section>
    <p class="status" id="status"></p>
    <div class="actions">
      <button type="button" id="cancel">Cancel</button>
      <button type="button" id="save" class="primary">Save</button>
    </div>`

  const byId = (id) => document.getElementById(id)

  function renderPicked() {
    byId('picked').innerHTML = draft.path
      ? esc(draft.path)
      : '<span class="hint">Tap a value below</span>'
  }

  function renderQuick() {
    if (!quick.length) return
    byId('quick').innerHTML = quick
      .map(
        (q) =>
          `<button type="button" class="choice${q.path === draft.path ? ' on' : ''}" data-path="${esc(q.path)}" title="${esc(q.title)}">${esc(q.label)}</button>`
      )
      .join('')
  }

  /** Fill labels the user left empty from a quick pick: one tap sets it all up. */
  function labelFromQuick(q) {
    const fill = (id, text) => {
      const field = byId(id)
      if (field && !field.value.trim()) field.value = text
    }
    if (has('label')) fill('label', q.label)
    if (has('topLabel')) fill('topLabel', q.title)
    if (has('bottomLabel')) fill('bottomLabel', q.label)
  }

  function renderBrowser() {
    const trail = [{ key: 'All', path: '' }, ...crumbs(browsing)]
    byId('crumbs').innerHTML = trail
      .map(
        (c, i) =>
          `<button type="button" class="crumb${i === trail.length - 1 ? ' here' : ''}" data-prefix="${esc(c.path)}">${esc(c.key)}</button>`
      )
      .join('<span class="sep">›</span>')

    const { groups, leaves } = childrenAt(paths, browsing)
    const rows = [
      ...groups.map(
        (g) => `
        <button type="button" class="entry group" data-prefix="${esc(g.path)}">
          <span class="name">${esc(g.key)}</span>
          <span class="meta">${g.count}</span><span class="chev">›</span>
        </button>`
      ),
      ...leaves.map(
        (l) => `
        <button type="button" class="entry leaf${l.path === draft.path ? ' on' : ''}" data-path="${esc(l.path)}">
          <span class="name">${esc(l.key)}</span>
          <span class="meta">${esc(rawValueText(valueByPath[l.path], unitsByPath[l.path]))}</span>
        </button>`
      )
    ]
    byId('browse').innerHTML = rows.length
      ? rows.join('')
      : '<p class="status">No matching Signal K paths on this server.</p>'
  }

  function renderUnits() {
    if (!has('convert')) return
    byId('convert').innerHTML = conversionChoices(unitsByPath[draft.path])
      .map(
        (c) =>
          `<button type="button" class="choice${c.key === draft.convert ? ' on' : ''}" data-convert="${c.key}">${esc(c.label)}</button>`
      )
      .join('')
  }

  function renderSteppers() {
    for (const id of ['min', 'max', 'decimals']) {
      if (has(id)) byId(id).textContent = String(draft[id])
    }
  }

  function browse(prefix) {
    browsing = settle(paths, prefix)
    renderBrowser()
  }

  function pick(path) {
    if (path === draft.path) return
    draft.path = path
    // A previously saved conversion is kept only while its path is selected.
    const valid = conversionChoices(unitsByPath[path]).map((c) => c.key)
    draft.convert =
      path === state.path && valid.includes(state.convert ?? USE_DEFAULT)
        ? (state.convert ?? USE_DEFAULT)
        : USE_DEFAULT
    renderQuick()
    renderPicked()
    renderBrowser()
    renderUnits()
  }

  function step(id, direction) {
    if (id === 'decimals') {
      draft.decimals = Math.min(
        MAX_DECIMALS,
        Math.max(0, draft.decimals + direction)
      )
    } else {
      const next = stepValue(
        draft[id],
        niceStep(Math.abs(draft.max - draft.min)),
        direction
      )
      // Keep the range non-empty: min stays below max. A range saved the
      // wrong way round may only move towards a valid one.
      if (draft.min < draft.max) {
        if (id === 'min' && next >= draft.max) return
        if (id === 'max' && next <= draft.min) return
      } else {
        if (id === 'min' && direction > 0) return
        if (id === 'max' && direction < 0) return
      }
      draft[id] = next
    }
    renderSteppers()
  }

  if (quick.length) {
    byId('quick').addEventListener('click', (ev) => {
      const chip = ev.target.closest('[data-path]')
      if (!chip) return
      const q = quick.find((item) => item.path === chip.dataset.path)
      labelFromQuick(q)
      // Re-tapping the chosen value still brings its group back into view.
      if (q.path === draft.path) {
        browse(parentOf(q.path))
      } else {
        browsing = settle(paths, parentOf(q.path))
        pick(q.path)
      }
    })
  }
  byId('crumbs').addEventListener('click', (ev) => {
    const crumb = ev.target.closest('[data-prefix]')
    if (crumb) browse(crumb.dataset.prefix)
  })
  byId('browse').addEventListener('click', (ev) => {
    const entry = ev.target.closest('.entry')
    if (!entry) return
    if (entry.dataset.path !== undefined) pick(entry.dataset.path)
    else browse(entry.dataset.prefix)
  })
  if (has('convert')) {
    byId('convert').addEventListener('click', (ev) => {
      const choice = ev.target.closest('[data-convert]')
      if (!choice) return
      draft.convert = choice.dataset.convert
      renderUnits()
    })
  }
  for (const stepper of document.querySelectorAll('.stepper')) {
    for (const button of stepper.querySelectorAll('.step')) {
      repeatWhileHeld(button, () =>
        step(stepper.dataset.field, Number(button.dataset.dir))
      )
    }
  }

  renderQuick()
  renderPicked()
  renderBrowser()
  renderUnits()
  renderSteppers()

  function collect() {
    const values = { path: draft.path }
    for (const id of Object.keys(TEXT_FIELDS)) {
      if (has(id)) values[id] = byId(id).value.trim()
    }
    if (has('convert')) values.convert = draft.convert
    if (has('min')) {
      values.min = draft.min
      values.max = draft.max
    }
    if (has('decimals')) values.decimals = draft.decimals
    return values
  }

  const status = byId('status')
  byId('save').addEventListener('click', async () => {
    try {
      await client.state.set(collect())
      status.textContent = 'Saved.'
      await client.call('ui.closePanel').catch(() => {})
    } catch (err) {
      status.textContent = `Save failed: ${err.message}`
    }
  })
  byId('cancel').addEventListener('click', () => {
    client.call('ui.closePanel').catch(() => {})
  })
}

main().catch((err) => {
  document.getElementById('root').textContent = `Host connection failed: ${err.message}`
  console.error(err)
})
