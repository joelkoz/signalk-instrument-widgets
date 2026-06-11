# signalk-instrument-widgets

Reference extension for the Signal K **plotterExtensions** specification.
Provides three single-value instrument widgets for chartplotters that
implement the plotter extension host contract (first reference host:
Freeboard-SK):

- **Gauge** (1x1) — a dial for any numeric Signal K path.
- **Meter** (2x1) — a 0–100% bar for ratio-style paths.
- **Switch** (1x1) — displays a boolean/0-1 path; tap to actuate via PUT.

Each placed widget instance is configured independently: press and hold a
widget to open its setup panel, pick a Signal K path (with optional unit
conversion, range and label), and save. Configuration is stored per instance
through the host's state API, so two gauges can show two different values.

## How it works

- The plugin registers a read-only resource provider for the custom resource
  type `plotterExtensions`; the single resource is this extension's manifest
  (widgets + config panel + capability requirements).
- The widget/panel pages in `public/` are served by the Signal K server at
  `/signalk-instrument-widgets/` (standard `signalk-webapp` mechanism, not
  admin-gated).
- Widgets talk to the host chartplotter over the
  [`signalk-plotterext-bus`](https://github.com/joelkoz/signalk-plotterext-bus)
  protocol (JSON-RPC 2.0 over postMessage): `signalk.stream` for live values,
  `signalk.put` for the switch, `state.*` for per-instance configuration.

## Demo switch

Playback/demo servers usually have no writable switch paths. By default the
plugin registers a PUT handler for `electrical.switches.demo.state` and emits
it as a delta, so the switch widget is testable anywhere. Disable in the
plugin settings.

## Development

```sh
npm install
npm run build    # bundles src/web -> public/
npm test         # plugin contract tests (node --test)
```

## License

MIT
