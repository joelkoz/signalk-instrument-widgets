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
public/     Build output (gitignored). Generated from src/web/ by build.mjs
            and served by the plugin as a top-level static route at
            /plotterext/signalk-instrument-widgets/ (not a signalk-webapp, so
            absent from the Webapps launcher). NOT a source artifact — do not
            hand-edit or commit; edit src/web and rebuild. It is whitelisted in
            "files", and the prepare script rebuilds it on publish, so it ships
            in the npm tarball without being in git.
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

- **Serve UI assets from a public top-level static route, not from
  `/plugins/*`.** The plugin mounts `public/` itself with
  `app.use('/plotterext/signalk-instrument-widgets', require('express').static(PUBLIC_DIR))`.
  Do **not** use `registerWithRouter()` / `/plugins/*` for UI — those are
  admin-gated and break read-only users. Do **not** re-add the
  `signalk-webapp` keyword: it would list this plugin in the server's Webapps
  launcher, but these pages are only ever loaded inside a host iframe, never
  launched standalone. (Express is provided by the server, so requiring it
  adds no runtime dependency of our own.)
- **The resource provider stays read-only.** `setResource`/`deleteResource`
  must reject. The manifest is code, not user data.
- **No server-side runtime dependencies.** The bus client is bundled into
  the browser assets at build time; the plugin itself must run with nothing
  beyond what the Signal K server provides.
  - `signalk-plotterext-bus` is a **devDependency referenced by its published
    semver range**, never a local `file:` path. It is bundled into the browser
    assets at build time, so it is not a runtime dependency. If you develop
    against a local checkout of the bus, do **not** commit the resulting
    lockfile — it records the sibling path and pins the linked version, which
    breaks `npm ci` in CI. Regenerate from the registry before committing:
    `rm -rf node_modules package-lock.json && npm install`, then confirm the
    lock has zero `../signalk-plotterext-bus` references.
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
- Keep the manifest and `REQUIREMENTS.md` in sync with any `src/web` edit.
  `public/` is gitignored build output — rebuild it to test, but there is
  nothing to commit; `prepare` regenerates it at publish time.
- **Build scripts must log to stderr, never stdout.** npm 10 (Node 22) runs
  `prepare` during `npm pack` even under `--ignore-scripts`, so anything on
  stdout is prepended to the JSON that `npm pack --json` emits — which the
  SignalK plugin-CI package check parses. Its parse then fails, its fallback
  derives a garbage file list, and the check reports the entry point as
  missing. Node 24 / npm 11 skips the build and masks this, so it fails on
  Node 22 only. Use `console.error` for build progress.
