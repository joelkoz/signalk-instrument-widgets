// Unit-aware conversion selection tests (pure logic in src/web/units.mjs).

import { test } from 'node:test'
import assert from 'node:assert'
import {
  VALID_BY_UNIT,
  validConversions,
  defaultConversion,
  applyFormula,
  resolveDisplay,
  USE_DEFAULT
} from '../src/web/units.mjs'

const near = (a, b, eps = 1e-4) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !~= ${b}`)

const ALL = ['none', 'ms-kn', 'k-c', 'rad-deg', 'ratio-pct', 'm-ft', 'pa-hpa']

test('validConversions filters by SK meta units', () => {
  assert.deepStrictEqual(validConversions('m/s', ALL), VALID_BY_UNIT['m/s'])
  assert.deepStrictEqual(validConversions('K', ALL), VALID_BY_UNIT.K)
  assert.deepStrictEqual(validConversions('ratio', ALL), VALID_BY_UNIT.ratio)
})

test('unknown or missing units offer every conversion', () => {
  assert.deepStrictEqual(validConversions(undefined, ALL), ALL)
  assert.deepStrictEqual(validConversions('Hz', ALL), ALL)
})

test('speed defaults follow the preferred speed unit', () => {
  const path = 'navigation.speedOverGround'
  assert.strictEqual(defaultConversion('m/s', path, { speed: 'kn' }), 'ms-kn')
  assert.strictEqual(defaultConversion('m/s', path, { speed: 'km/h' }), 'ms-kmh')
  assert.strictEqual(defaultConversion('m/s', path, { speed: 'mph' }), 'ms-mph')
  assert.strictEqual(defaultConversion('m/s', path, { speed: 'm/s' }), 'none')
  // no preferences available: sensible marine default
  assert.strictEqual(defaultConversion('m/s', path, null), 'ms-kn')
})

test('temperature defaults follow the preferred temperature unit', () => {
  const path = 'environment.water.temperature'
  assert.strictEqual(defaultConversion('K', path, { temperature: 'C' }), 'k-c')
  assert.strictEqual(defaultConversion('K', path, { temperature: 'F' }), 'k-f')
  assert.strictEqual(defaultConversion('K', path, null), 'k-c')
})

test('metre paths disambiguate by path name', () => {
  const prefs = { depth: 'foot', length: 'm', distance: 'naut-mile' }
  assert.strictEqual(
    defaultConversion('m', 'environment.depth.belowTransducer', prefs),
    'm-ft'
  )
  assert.strictEqual(
    defaultConversion('m', 'environment.depth.belowTransducer', { depth: 'm' }),
    'none'
  )
  assert.strictEqual(defaultConversion('m', 'navigation.trip.log', prefs), 'm-nm')
  assert.strictEqual(
    defaultConversion('m', 'navigation.trip.log', { distance: 'kilometer' }),
    'm-km'
  )
  assert.strictEqual(defaultConversion('m', 'design.length.overall', prefs), 'none')
  assert.strictEqual(
    defaultConversion('m', 'design.length.overall', { length: 'foot' }),
    'm-ft'
  )
})

test('angles, ratios and pressure get display-friendly defaults', () => {
  assert.strictEqual(defaultConversion('rad', 'navigation.headingTrue', null), 'rad-deg')
  assert.strictEqual(defaultConversion('ratio', 'tanks.fuel.0.currentLevel', null), 'ratio-pct')
  assert.strictEqual(defaultConversion('Pa', 'environment.outside.pressure', null), 'pa-hpa')
  assert.strictEqual(defaultConversion(undefined, 'anything', null), 'none')
})

test('applyFormula evaluates server value expressions', () => {
  near(applyFormula(1, 'value * 1.94384'), 1.94384)
  near(applyFormula(273.15, 'value - 273.15'), 0)
})

test('applyFormula passes bad input through unchanged', () => {
  assert.strictEqual(applyFormula('x', 'value * 2'), 'x')
  assert.strictEqual(applyFormula(undefined, 'value * 2'), undefined)
  // Unparseable / throwing formulas fall back to the raw value.
  assert.strictEqual(applyFormula(5, 'value *'), 5)
  assert.strictEqual(applyFormula(5, 'nope()'), 5)
})

test('resolveDisplay: explicit per-widget conversion is the ultimate authority', () => {
  // Even when the server publishes a different displayUnits, an explicit key wins.
  const meta = {
    units: 'm/s',
    displayUnits: { formula: 'value * 3.6', symbol: 'km/h' }
  }
  const r = resolveDisplay({ value: 1, convert: 'ms-kn', meta, prefs: null })
  near(r.value, 1.943844)
  assert.strictEqual(r.symbol, 'kn')
})

test('resolveDisplay: default follows the server per-path displayUnits', () => {
  const meta = {
    units: 'm/s',
    displayUnits: { targetUnit: 'kn', formula: 'value * 1.94384', symbol: 'kn' }
  }
  for (const convert of [USE_DEFAULT, undefined]) {
    const r = resolveDisplay({ value: 2, convert, meta, prefs: { speed: 'km/h' } })
    near(r.value, 3.88768) // server preference, NOT the host km/h preference
    assert.strictEqual(r.symbol, 'kn')
  }
})

test('resolveDisplay: displayUnits without a formula still supplies the symbol', () => {
  const meta = { units: 'ratio', displayUnits: { targetUnit: '%', symbol: '%' } }
  const r = resolveDisplay({ value: 0.5, convert: USE_DEFAULT, meta })
  assert.strictEqual(r.value, 0.5)
  assert.strictEqual(r.symbol, '%')
})

test('resolveDisplay: falls back to base-unit + host preference without displayUnits', () => {
  const meta = { units: 'm/s' } // no displayUnits
  const r = resolveDisplay({
    value: 1,
    convert: USE_DEFAULT,
    meta,
    prefs: { speed: 'km/h' },
    path: 'navigation.speedOverGround'
  })
  near(r.value, 3.6)
  assert.strictEqual(r.symbol, 'km/h')
})

test('resolveDisplay: fallback option applies when the heuristic finds nothing', () => {
  // meter default for a ratio path with no metadata at all.
  const r = resolveDisplay({
    value: 0.5,
    convert: USE_DEFAULT,
    meta: undefined,
    fallback: 'ratio-pct'
  })
  near(r.value, 50)
  assert.strictEqual(r.symbol, '%')
})

test('resolveDisplay: no meta and no fallback yields the raw value', () => {
  const r = resolveDisplay({ value: 42, convert: USE_DEFAULT, meta: undefined })
  assert.strictEqual(r.value, 42)
  assert.strictEqual(r.symbol, '')
})
