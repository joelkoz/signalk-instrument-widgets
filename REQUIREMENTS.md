# Requirements: signalk-instrument-widgets

The authoritative implementation spec for this plugin. It assumes the
Signal K plotter extension specification (`plotter-extensions-api.md` in
this repository, destined for `SignalK/signalk-server`
`docs/develop/rest-api/proposed/`) and the `signalk-plotterext-bus` wire
protocol as context.

## 1. Manifest contract

The plugin registers a **read-only** resource provider for the custom
resource type `plotterExtensions` exposing exactly one resource, keyed by
the plugin id `signalk-instrument-widgets`:

- `apiVersion: "1"`.
- `requires: ["widgets", "panels.iframe", "signalk.stream"]` — hosts lacking
  any of these must not offer the extension.
- `optional: ["signalk.put"]` — the switch widget degrades to display-only
  on hosts without PUT relay.
- Four widgets, all `type: "iframe"`, all naming `configPanel:
  "instrument-config"`, all `lifecycle: "whileEnabled"`:
  - `gauge` — size `1x1`
  - `meter` — size `2x1`
  - `switch` — size `1x1`
  - `display` — size `1x1`
- One panel: `instrument-config`, `type: "iframe"`, `lifecycle: "onOpen"`.
- All asset URLs are server-relative under
  `/plotterext/signalk-instrument-widgets/` (hosts resolve them against the
  Signal K server origin).

`listResources` returns `{}` and `getResource` rejects while the plugin is
stopped. `setResource`/`deleteResource` always reject.

## 2. Widget behavior

Common (implemented once in the shared runtime):

- Connect to the host with the bus client; read per-instance configuration
  via `state.get` (instance scope).
- Subscribe to the configured Signal K path via `signalk.subscribe`; render
  on every value event.
- Re-load configuration and re-subscribe on `state.changed`.
- Detect press-and-hold (~600 ms) and call `ui.openConfigPanel`. A short
  tap must still work as a tap (the switch uses this).
- Unconfigured state renders "Not configured" plus placeholder value —
  never a blank or broken frame. Host-connection failure renders a visible
  error message.
- Visuals: translucent dark card, readable over light and dark charts,
  responsive to any frame size the host provides (SVG with viewBox).

Per widget:

- **Gauge**: 240° dial; needle plus numeric value; configured min/max
  bounds and decimal places; value clamped to the dial range; converted
  units label shown.
- **Meter**: horizontal 0–100% bar; default conversion `ratio -> %` (Signal K
  ratio paths are 0..1); value clamped to 0–100.
- **Switch**: ON/OFF pill display for boolean or 0/1 paths; tap actuates
  via `signalk.put` with the inverted value (1/0); a tap that was actually
  a long press must not actuate; no actuation attempt when the host lacks
  the `signalk.put` capability or no path is configured.
- **Display Value**: three center-justified rows — optional small top
  label, the live value in the largest text (with converted units), and an
  optional larger bottom label. A blank label renders nothing (the value
  re-centers). Example: top "Speed over ground", bottom "SOG", value in the
  middle. Label text is HTML-escaped before rendering.

## 3. Configuration panel

- Opened by the host with `context.targetInstance` (the widget instance
  being configured) and `context.targetWidget` (`gauge` | `meter` |
  `switch`). State reads/writes apply to the target instance's scope.
- Path candidates come from the server's full data tree
  (`/signalk/v1/api/vessels/self`, same-origin fetch): numeric leaves for
  gauge/meter/display; boolean leaves — plus numeric leaves that look
  switch-like (`switches` segment or `.state` suffix) — for the switch. The
  same walk collects each path's `meta.units`.
- Conversion selection is unit-aware (logic in `src/web/units.mjs`):
  - The default, always-offered choice is **"Server default"** (`convert`
    value `default`, the schema default). It defers unit selection to render
    time, so an unconfigured widget follows the user's server-defined display
    preferences automatically and never needs configuring in the normal case.
  - Below it, explicit per-widget conversions are offered as overrides,
    filtered to those valid for the selected path's `meta.units` (paths
    without metadata offer everything). An explicit choice is the ultimate
    authority and overrides the server preference.
  - A previously saved choice (including "Server default") is kept while the
    saved path is selected; choosing a different path resets to "Server
    default".
- Display-unit resolution at render time (`resolveDisplay`, in
  `src/web/units.mjs`) applies this authority order for every value shown:
  1. An explicit per-widget conversion key, if set (never overridden).
  2. The server's per-path display preference — `meta.displayUnits`
     (Signal K Unit Preferences): its `formula` converts the value and its
     `symbol`/`targetUnit` labels it. Fetched over same-origin REST
     (`.../<path>/meta`) by the widget runtime, since the bus value stream
     carries no metadata.
  3. Fallback heuristic combining the path's `meta.units` with the host's
     coarse category preferences (`units.get`, capability `units`; tolerated
     absent): speed/temperature follow the preference directly; metre paths
     disambiguate by path name (depth -> depth preference, distance/log ->
     distance preference, otherwise length preference); angles, ratios and
     pressure default to degrees, percent and hPa. The percent meter passes a
     `ratio-pct` fallback so ratio paths still read as a percentage.
- Fields by widget type:
  - gauge: path, label, conversion, min, max, decimals
  - meter: path, label, conversion, decimals
  - switch: path, label
  - display: path, topLabel, bottomLabel, conversion, decimals
- Save writes all fields with one `state.set` call (the host's resulting
  `state.changed` event live-updates the widget) and then closes itself via
  `ui.closePanel`. Cancel closes without writing.

## 4. Per-instance state schema

Stored through the host state API, instance scope. All keys optional:

```
path         string   Signal K path (dot notation)
label        string   display label (falls back to path)
topLabel     string   display widget: small top title (blank = hidden)
bottomLabel  string   display widget: large bottom label (blank = hidden)
convert      string   conversion key (see below; default `default`)
min, max     number   gauge dial bounds
decimals     number   displayed decimal places
```

Conversion keys: `default` (follow the server/host display preference — the
default), `none`, `ms-kn`, `ms-kmh`, `ms-mph`, `k-c`, `k-f`, `rad-deg`,
`ratio-pct`, `m-ft`, `m-nm`, `m-km`, `pa-hpa`. Unknown keys must behave as
`default` (forward compatibility).

## 5. Demo switch

Playback/demo servers rarely have writable switch paths, so by default
(plugin option `enableDemoSwitch`, default true) the plugin:

- Registers a PUT handler for `electrical.switches.demo.state` on
  `vessels.self` that normalizes the value to 0/1, emits the new value as a
  delta, and returns `{ state: 'COMPLETED', statusCode: 200 }`.
- Emits the initial value at startup so the path exists immediately.

## 6. Serving and packaging

- Web assets are built into `public/` and served by the plugin itself as a
  top-level Express static route at `/plotterext/signalk-instrument-widgets/`
  (`app.use(ASSET_BASE, require('express').static(PUBLIC_DIR))`) — publicly
  readable, independent of admin auth. The plugin is deliberately **not** a
  `signalk-webapp` (the keyword is omitted) so it stays out of the server's
  Webapps launcher; these assets only ever load inside a host iframe.
  `/plugins/*` routes must not be used for any UI asset — they are admin-gated
  and would break read-only users.
- `public/` is committed (the published package must work without a build
  step on the server).
- The plugin entry is dependency-free CommonJS; the bus client is bundled
  into the browser assets by esbuild at build time.
- `index.html` in `public/` explains to a human who opens the webapp entry
  that configuration happens in the chartplotter, not here.

## 7. Test plan

`node --test` must cover at minimum:

- Provider registration: type `plotterExtensions`; manifest shape (api
  version, required capabilities, three iframe widgets with valid sizes and
  config panel references, asset URL prefix); single-resource get;
  rejection of unknown ids and of set/delete.
- Demo switch: PUT handler registration, initial delta emission, toggle
  round-trip, opt-out via configuration.
- Stopped-plugin behavior (empty list, rejecting get).

End-to-end verification (manual, against a host implementation): place each
widget, configure a path, observe live values; toggle the switch; confirm
config changes apply without reloading the host.
