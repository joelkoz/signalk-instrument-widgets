// Unit-aware conversion selection tests (pure logic in src/web/units.mjs).

import { test } from 'node:test'
import assert from 'node:assert'
import {
  VALID_BY_UNIT,
  validConversions,
  defaultConversion
} from '../src/web/units.mjs'

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
