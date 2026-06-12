# Agent Instructions

Before changing or debugging this repository, read:

1. `README.md` — end-user documentation: what the widgets do and how users
   configure them. Keep it user-facing; developer material belongs here and
   in `REQUIREMENTS.md`.
2. `plotter-extensions-api.md` — the Plotter Extensions API specification
   (draft). This repository hosts the spec document until it is submitted
   upstream to `SignalK/signalk-server` (`docs/develop/rest-api/proposed/`).
   Keep it in sync with implemented behavior.
3. `REQUIREMENTS.md` — the authoritative implementation spec for this
   plugin: manifest contract, widget behavior, state schema, serving rules,
   test plan.

## What this plugin is

The first reference extension for the Signal K **plotter extension**
mechanism (the `plotterExtensions` resource type — see
`plotter-extensions-api.md` in this repository).
It exists both as a useful end-user feature (single-value instrument
widgets for chartplotters) and as the example future extension authors will
copy. Code clarity matters more than cleverness here.

The plugin talks to host chartplotters over the
[`signalk-plotterext-bus`](https://www.npmjs.com/package/signalk-plotterext-bus)
protocol. The first reference host implementation is Freeboard-SK.

## Repository layout

```
plugin/     Plugin entry (CommonJS) run by the Signal K server: registers
            the plotterExtensions resource provider and the optional demo
            switch PUT handler. Deliberately tiny — all UI lives in iframes.
src/web/    Widget/panel browser source (plain JS modules + CSS).
            common.js is the shared runtime: host connection, config
            loading, value conversion, long-press gesture.
scripts/    build.mjs — esbuild bundles src/web -> public/ and generates
            the HTML pages.
public/     Built web assets, committed. Served by the Signal K server at
            /signalk-instrument-widgets/ via the standard signalk-webapp
            mechanism. Generated — do not hand-edit; edit src/web and
            rebuild.
test/       node --test suites for the plugin contract.
```

## Build / test

```sh
npm install
npm run build     # bundle src/web -> public/
npm test          # plugin contract tests (node --test)
```

To exercise the widgets end to end you need a Signal K server with this
plugin installed and enabled, plus a chartplotter host that implements the
plotter extension widget contract (Freeboard-SK is the reference). A data
source with live numeric paths (real or playback) drives the gauge/meter;
the built-in demo switch path covers the switch widget anywhere.

## Engineering rules

- **Serve assets only through the `signalk-webapp` mechanism** (`public/`
  at `/signalk-instrument-widgets/`). Never serve UI through
  `registerWithRouter()` routes — the server gates all `/plugins/*` routes
  behind admin authentication, which breaks read-only users.
- **The resource provider stays read-only.** `setResource`/`deleteResource`
  must reject. The manifest is code, not user data.
- **No server-side runtime dependencies.** The bus client is bundled into
  the browser assets at build time; the plugin itself must run with nothing
  beyond what the Signal K server provides.
  - Note: until `signalk-plotterext-bus` is published to npm, `package.json`
    carries it as a local `file:` devDependency. Replace with a semver range
    at publication time.
- **Widgets are guests on someone else's chart.** They must render
  responsively inside whatever frame size the host provides, keep a
  translucent-dark visual treatment that works over light and dark charts,
  and never navigate, open windows, or block the UI thread.
- **Interaction model:** glanceable display + one tap action at most
  (switch toggle). Anything richer belongs in the configuration panel. The
  press-and-hold gesture is detected inside the widget (hosts cannot see
  pointer events inside an iframe) and calls the host method
  `ui.openConfigPanel` — keep that behavior in `common.js` so every widget
  inherits it.
- All host communication goes through the bus client. The one sanctioned
  exception is the configuration panel fetching the Signal K data tree
  directly over same-origin REST to enumerate candidate paths.
- Keep manifest, `REQUIREMENTS.md`, and built `public/` assets in sync —
  rebuild and commit `public/` in the same change as any `src/web` edit.
