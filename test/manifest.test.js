// Plugin contract tests: provider registration shape and manifest validity.

const { test } = require('node:test')
const assert = require('node:assert')

function fakeApp() {
  const calls = { providers: [], putHandlers: [], messages: [] }
  return {
    calls,
    debug: () => {},
    error: () => {},
    registerResourceProvider: (p) => calls.providers.push(p),
    registerPutHandler: (ctx, path, handler) =>
      calls.putHandlers.push({ ctx, path, handler }),
    handleMessage: (id, delta) => calls.messages.push({ id, delta })
  }
}

test('registers a read-only plotterExtensions provider with a valid manifest', async () => {
  const app = fakeApp()
  const plugin = require('../plugin/index.js')(app)
  plugin.start({})

  assert.strictEqual(app.calls.providers.length, 1)
  const provider = app.calls.providers[0]
  assert.strictEqual(provider.type, 'plotterExtensions')

  const list = await provider.methods.listResources({})
  const ids = Object.keys(list)
  assert.deepStrictEqual(ids, ['signalk-instrument-widgets'])

  const manifest = list['signalk-instrument-widgets']
  assert.strictEqual(manifest.apiVersion, '1')
  assert.ok(manifest.requires.includes('widgets'))
  assert.ok(manifest.requires.includes('signalk.stream'))
  assert.strictEqual(manifest.widgets.length, 3)
  for (const widget of manifest.widgets) {
    assert.match(widget.size, /^[12]x[12]$/)
    assert.strictEqual(widget.type, 'iframe')
    assert.ok(widget.url.startsWith('/signalk-instrument-widgets/'))
    assert.strictEqual(widget.configPanel, 'instrument-config')
  }
  assert.strictEqual(manifest.panels[0].id, 'instrument-config')

  const single = await provider.methods.getResource('signalk-instrument-widgets')
  assert.strictEqual(single.name, manifest.name)
  await assert.rejects(() => provider.methods.getResource('nope'))
  await assert.rejects(() => provider.methods.setResource('x', {}))
  await assert.rejects(() => provider.methods.deleteResource('x'))
})

test('demo switch PUT handler toggles and emits deltas', () => {
  const app = fakeApp()
  const plugin = require('../plugin/index.js')(app)
  plugin.start({ enableDemoSwitch: true })

  assert.strictEqual(app.calls.putHandlers.length, 1)
  const { path, handler } = app.calls.putHandlers[0]
  assert.strictEqual(path, 'electrical.switches.demo.state')
  // Initial emit
  assert.strictEqual(app.calls.messages.length, 1)

  const result = handler('vessels.self', path, 1)
  assert.strictEqual(result.state, 'COMPLETED')
  const last = app.calls.messages.at(-1)
  assert.deepStrictEqual(last.delta.updates[0].values[0], { path, value: 1 })
})

test('demo switch can be disabled', () => {
  const app = fakeApp()
  const plugin = require('../plugin/index.js')(app)
  plugin.start({ enableDemoSwitch: false })
  assert.strictEqual(app.calls.putHandlers.length, 0)
})

test('provider returns empty list when plugin is stopped', async () => {
  const app = fakeApp()
  const plugin = require('../plugin/index.js')(app)
  plugin.start({})
  plugin.stop()
  const provider = app.calls.providers[0]
  assert.deepStrictEqual(await provider.methods.listResources({}), {})
})
