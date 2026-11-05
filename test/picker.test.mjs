// Touch-panel helper tests (pure logic in src/web/picker.mjs).

import { test } from 'node:test'
import assert from 'node:assert'
import {
  childrenAt,
  settle,
  parentOf,
  crumbs,
  niceStep,
  stepValue,
  quickPicks
} from '../src/web/picker.mjs'

const PATHS = [
  'electrical.batteries.house.voltage',
  'electrical.batteries.house.current',
  'navigation.speedOverGround',
  'navigation.courseOverGroundTrue',
  'navigation.attitude.roll',
  'tanks.freshWater.0.currentLevel',
  'tanks.fuel.0.currentLevel'
]

test('childrenAt lists groups with counts, then leaves', () => {
  const top = childrenAt(PATHS, '')
  assert.deepStrictEqual(
    top.groups.map((g) => [g.key, g.count]),
    [['electrical', 2], ['navigation', 3], ['tanks', 2]]
  )
  assert.deepStrictEqual(top.leaves, [])

  const nav = childrenAt(PATHS, 'navigation')
  assert.deepStrictEqual(nav.groups.map((g) => g.path), ['navigation.attitude'])
  assert.deepStrictEqual(nav.leaves.map((l) => l.path), [
    'navigation.courseOverGroundTrue',
    'navigation.speedOverGround'
  ])
})

test('childrenAt does not match a prefix that is only a string prefix', () => {
  const { groups, leaves } = childrenAt(['tanksX.a', 'tanks.b'], 'tanks')
  assert.deepStrictEqual(groups, [])
  assert.deepStrictEqual(leaves.map((l) => l.path), ['tanks.b'])
})

test('settle skips groups that only hold one deeper group', () => {
  assert.strictEqual(settle(PATHS, 'electrical'), 'electrical.batteries.house')
  assert.strictEqual(settle(PATHS, 'tanks'), 'tanks')
  assert.strictEqual(settle(PATHS, 'tanks.fuel'), 'tanks.fuel.0')
  assert.strictEqual(settle(PATHS, ''), '')
})

test('parentOf and crumbs walk the path segments', () => {
  assert.strictEqual(parentOf('tanks.fuel.0.currentLevel'), 'tanks.fuel.0')
  assert.strictEqual(parentOf('uuid'), '')
  assert.deepStrictEqual(crumbs(''), [])
  assert.deepStrictEqual(crumbs('tanks.fuel'), [
    { key: 'tanks', path: 'tanks' },
    { key: 'fuel', path: 'tanks.fuel' }
  ])
})

test('niceStep crosses the span in about twenty round steps', () => {
  assert.strictEqual(niceStep(10), 0.5)
  assert.strictEqual(niceStep(100), 5)
  assert.strictEqual(niceStep(3000), 200)
  assert.strictEqual(niceStep(1), 0.05)
  assert.strictEqual(niceStep(0), 1)
  assert.strictEqual(niceStep(-5), 1)
})

test('stepValue moves to the next grid point without float residue', () => {
  assert.strictEqual(stepValue(0.2, 0.1, 1), 0.3)
  assert.strictEqual(stepValue(10, 0.5, -1), 9.5)
  assert.strictEqual(stepValue(3, 2, 1), 4)
  assert.strictEqual(stepValue(3, 2, -1), 2)
  assert.strictEqual(stepValue(0, 5, -1), -5)
})

test('quickPicks offers only values the server has, in a fixed order', () => {
  assert.deepStrictEqual(
    quickPicks(PATHS).map((q) => q.label),
    ['SOG', 'COG']
  )
  assert.deepStrictEqual(quickPicks([]), [])
})
