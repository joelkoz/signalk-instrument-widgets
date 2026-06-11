// signalk-instrument-widgets
//
// Reference extension for the plotterExtensions specification. The plugin
// itself is intentionally small: it registers a read-only plotterExtensions
// resource provider whose single resource is this extension's manifest, and
// (optionally) provides a demo switch path with a PUT handler so the switch
// widget can be exercised against playback data that has no real switches.
//
// The widget/panel web assets live in public/ and are served by the Signal K
// server at /signalk-instrument-widgets/ through the standard signalk-webapp
// mechanism (public, not admin-gated like /plugins/*).

const PLUGIN_ID = 'signalk-instrument-widgets'
const ASSET_BASE = `/${PLUGIN_ID}`
const DEMO_SWITCH_PATH = 'electrical.switches.demo.state'

const pkg = require('../package.json')

function buildManifest() {
  return {
    name: 'Instrument Widgets',
    description:
      'Single-value instrument widgets: gauge, percent meter and switch.',
    version: pkg.version,
    apiVersion: '1',
    requires: ['widgets', 'panels.iframe', 'signalk.stream'],
    optional: ['signalk.put'],
    widgets: [
      {
        id: 'gauge',
        title: 'Gauge',
        type: 'iframe',
        url: `${ASSET_BASE}/gauge.html`,
        size: '1x1',
        configPanel: 'instrument-config',
        lifecycle: 'whileEnabled'
      },
      {
        id: 'meter',
        title: 'Meter (0-100%)',
        type: 'iframe',
        url: `${ASSET_BASE}/meter.html`,
        size: '2x1',
        configPanel: 'instrument-config',
        lifecycle: 'whileEnabled'
      },
      {
        id: 'switch',
        title: 'Switch',
        type: 'iframe',
        url: `${ASSET_BASE}/switch.html`,
        size: '1x1',
        configPanel: 'instrument-config',
        lifecycle: 'whileEnabled'
      }
    ],
    panels: [
      {
        id: 'instrument-config',
        title: 'Instrument Setup',
        type: 'iframe',
        url: `${ASSET_BASE}/config.html`,
        lifecycle: 'onOpen'
      }
    ]
  }
}

module.exports = (app) => {
  let providerRegistered = false
  let demoSwitchState = 0
  let running = false

  const debug = (msg) => app.debug(`${PLUGIN_ID}: ${msg}`)

  const registerProvider = () => {
    if (providerRegistered) return
    if (typeof app.registerResourceProvider !== 'function') {
      app.error(`${PLUGIN_ID}: server has no resource provider registry`)
      return
    }
    app.registerResourceProvider({
      type: 'plotterExtensions',
      methods: {
        listResources: async () => {
          if (!running) return {}
          return { [PLUGIN_ID]: buildManifest() }
        },
        getResource: async (id) => {
          if (!running || id !== PLUGIN_ID) {
            throw new Error(`No such plotterExtensions resource: ${id}`)
          }
          return buildManifest()
        },
        setResource: async () => {
          throw new Error(`${PLUGIN_ID} is a read-only provider`)
        },
        deleteResource: async () => {
          throw new Error(`${PLUGIN_ID} is a read-only provider`)
        }
      }
    })
    providerRegistered = true
  }

  const emitDemoSwitch = () => {
    app.handleMessage(PLUGIN_ID, {
      updates: [
        {
          values: [{ path: DEMO_SWITCH_PATH, value: demoSwitchState }]
        }
      ]
    })
  }

  const startDemoSwitch = () => {
    app.registerPutHandler(
      'vessels.self',
      DEMO_SWITCH_PATH,
      (_context, _path, value) => {
        demoSwitchState = value === true || value === 1 || value === '1' ? 1 : 0
        emitDemoSwitch()
        return { state: 'COMPLETED', statusCode: 200 }
      }
    )
    emitDemoSwitch()
    debug(`demo switch active at ${DEMO_SWITCH_PATH}`)
  }

  return {
    id: PLUGIN_ID,
    name: 'Instrument Widgets',
    description:
      'Gauge, meter and switch widgets for chartplotters that support the plotterExtensions resource type.',

    schema: () => ({
      type: 'object',
      properties: {
        enableDemoSwitch: {
          type: 'boolean',
          title: 'Provide a demo switch path',
          description:
            `Registers a PUT handler and emits ${DEMO_SWITCH_PATH} so the ` +
            'switch widget can be tested without real switch hardware.',
          default: true
        }
      }
    }),

    start(options) {
      running = true
      registerProvider()
      if (!options || options.enableDemoSwitch !== false) {
        startDemoSwitch()
      }
      debug('started')
    },

    stop() {
      running = false
      debug('stopped')
    }
  }
}
