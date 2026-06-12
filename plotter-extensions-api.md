---
title: Plotter Extensions API
---

# Working with the Plotter Extensions API

Web-based Signal K chartplotters (e.g. Freeboard-SK) are general-purpose
applications. Many valuable features — instrument widgets, custom panels,
domain-specific tooling — are too specific to bundle into a chartplotter's
core, yet forking the application to add them fragments the community.

The **Plotter Extensions API** defines a Signal K resource type —
`plotterExtensions` — through which any server plugin can offer optional
features to chartplotter applications without forking them. A host
chartplotter discovers extension manifests at runtime and lets the user
place and configure the contributions. Extensions are distributed through
the existing Signal K plugin/app-store flow.

`plotterExtensions` is a user-defined resource type hosted under the
`resources` path, so the collection is accessible at:

```text
/signalk/v2/api/resources/plotterExtensions
```

> **Status: draft.** This document describes extension API version `1` as
> implemented by the reference host (Freeboard-SK) and the reference
> extensions (`signalk-instrument-widgets`, `signalk-poi-search`): widgets,
> panels, toolbar buttons, state storage, Signal K data relay, unit
> preferences, resource display filters and map control. Background
> runtimes and manifest-declared filter chains are under development and
> intentionally not specified here yet.

---

## Design Principles

1. **Host-agnostic.** Nothing in the manifest or wire protocol names a
   specific chartplotter. Hosts identify themselves and their capabilities
   at runtime; extensions declare what they need.
2. **Framework-neutral.** The baseline integration unit is a sandboxed
   iframe plus a plain-JSON message protocol. Extensions need no particular
   UI framework and no TypeScript.
3. **Capability negotiation, not version lockstep.** An extension declares
   required and optional capabilities; a host only offers extensions whose
   requirements it can meet.
4. **The host stays the orchestrator.** Extensions interact through a
   deliberate host API — never host internals or the host DOM.
5. **Enablement lives on the server.** The user installed and enabled the
   providing plugin; that is the consent signal. The server's plugin
   enable/disable switch turns the whole extension off. Hosts must not add
   a second per-extension enable gate — presence in the
   `plotterExtensions` collection means enabled.

---

## Discovery

A host fetches the collection and receives extension manifests keyed by
extension id (the providing plugin's id is the recommended key):

```json
{
  "signalk-instrument-widgets": {
    "name": "Instrument Widgets",
    "description": "Single-value instrument widgets: gauge, percent meter and switch.",
    "version": "0.2.0",
    "apiVersion": "1",
    "requires": ["widgets", "panels.iframe", "signalk.stream"],
    "optional": ["signalk.put", "units"],
    "widgets": [
      {
        "id": "gauge",
        "title": "Gauge",
        "type": "iframe",
        "url": "/signalk-instrument-widgets/gauge.html",
        "size": "1x1",
        "configPanel": "instrument-config",
        "lifecycle": "whileEnabled"
      }
    ],
    "panels": [
      {
        "id": "instrument-config",
        "title": "Instrument Setup",
        "type": "iframe",
        "url": "/signalk-instrument-widgets/config.html",
        "lifecycle": "onOpen"
      }
    ]
  }
}
```

**Manifest fields**

- `name`, `description`, `version` — display metadata.
- `apiVersion` (required) — extension API major version; this document
  defines `"1"`. Hosts must not offer manifests targeting a newer version.
- `requires` — capability ids the host must support for the extension to be
  offered at all.
- `optional` — capability ids the extension uses when present; absence must
  not prevent it from running.
- Contribution sections: `widgets`, `panels`, `buttons` (this version).
  Hosts must ignore unknown sections and fields.
- Any individual contribution entry may declare its own `apiVersion` when
  it needs a newer host API than the manifest baseline; hosts silently omit
  contributions they cannot satisfy while keeping the rest.

**Capability identifiers (version 1)**

| Capability | Meaning |
| --- | --- |
| `widgets` | Host supports the widget grid described below (including the configuration-panel methods `ui.openConfigPanel` / `ui.closePanel`). |
| `panels.iframe` | Host supports iframe panels. |
| `buttons` | Host renders extension toolbar buttons in at least one slot. |
| `signalk.stream` | Host streams Signal K path values to extension contexts over the message bus. |
| `signalk.put` | Host relays Signal K PUT requests from extension contexts. |
| `units` | Host exposes the user's preferred display units (`units.get`). |
| `map` | Host implements the `map.*` methods (view query and control). |
| `resources` | Host implements `resources.list` (relayed resource queries). |
| `resources.filter` | Host implements imperative resource display filters. |
| `ui` | Host implements `ui.openPanel` / `ui.closePanel`. |

The vocabulary is open-ended: future versions add ids (buttons, resource
filters, map control), and hosts may expose vendor-specific experiments
under a prefix such as `x-<host>.<capability>`. Unknown ids in `optional`
are ignored; unknown ids in `requires` make the extension incompatible.

---

## Widgets

A widget is a small, always-visible tile overlaid on the chart — for
glanceable state, not complex interaction (interaction belongs in panels).

**Layout model.** The host defines *widget areas* at fixed anchor positions
of the chartplotter window — typically corners and/or edge centers; the set
is the host's choice (the reference host uses top-right, top-center,
bottom-center, bottom-left and bottom-right, reserving top-left for its own
controls). Each area is a grid of **2 columns × 2 rows**. A widget declares
only its size in grid cells as `<columns>x<rows>`: `1x1`, `2x1`, `1x2`, or
`2x2`.

**Placement is entirely the user's choice.** The user decides which area
and cells a widget occupies; the host provides the placement UI and
persists the layout. A widget never requests a position. (Reference host
UI: press-and-hold an empty anchor cell lists the widgets that fit there;
widgets pack from the screen edge inward.)

**Instances.** Placement is cell-based, not area-exclusive: widgets from
different extensions may share an area, and the same widget definition may
be placed multiple times. The host assigns each placement a unique, stable
instance id (a GUID), persists it with the layout, and passes it in the
handshake `context.instanceId`. Per-instance state is keyed by that id, so
two instances of the same widget are configured independently.

**Configuration.** A widget entry may name a panel from the same manifest
via `configPanel`. Pointer events inside a sandboxed iframe are invisible
to the host, so the press-and-hold gesture is detected by the widget
content itself (the reference client library implements it), which calls
the host method `ui.openConfigPanel`. The host opens the named panel with
`context.targetInstance` set to the widget's instance id and
`context.targetWidget` set to the widget's manifest-local id, and must also
provide a gesture-independent path to the same panel plus an affordance to
**remove** the widget instance (the reference host places a Remove button
in the configuration dialog).

**Widget fields:** `id`, `title`, `type` (`iframe`), `url`, `size`,
`configPanel?`, `lifecycle?`, `apiVersion?`.

---

## Panels

A panel is interactive content the host displays inside its existing UI
(dialog, drawer — the host chooses the chrome). The baseline type every
host supporting `panels.iframe` must implement is a sandboxed iframe served
by the providing plugin.

**Panel fields:** `id`, `title`, `type` (`iframe`), `url`, `lifecycle?`,
`apiVersion?`.

**Lifecycle values**

- `onOpen` — load when opened, unload when closed.
- `keepAlive` — load on first open, keep running (hidden) while available;
  panel state survives close/reopen.
- `whileEnabled` — load while the extension is available, independent of
  visibility (the expected default for placed widgets).

Panels are opened by toolbar buttons, by the host methods `ui.openPanel` /
`ui.togglePanel` (e.g. a widget tap), or — for configuration panels — by
`ui.openConfigPanel` / `ui.toggleConfigPanel`. The `toggle*` variants close
the panel if it is already the active one, otherwise open it. The reference
host shows general panels in a right-side drawer that pushes the chart
aside, and configuration panels in a dialog.

---

## Buttons

An extension may contribute buttons to host-defined UI slots:

```json
{
  "id": "open-poi-search",
  "title": "POI Search",
  "slot": "mapToolbar",
  "icon": "travel_explore",
  "action": { "type": "openPanel", "panel": "poi-search-panel" }
}
```

- `slot` — host-defined placement; `mapToolbar` is the one well-known slot
  every host supporting `buttons` must map to a reasonable toolbar
  location. Hosts fall back to a default slot for unknown values.
- `icon` — a Material icon name the host may render; hosts without that
  icon set may substitute a generic extension icon. (A generic `symbol`
  reference field is reserved for the symbols resource integration.)
- `action` — opens the named panel from the same manifest:
  - `togglePanel` — open the panel, or close it if it is already the active
    panel (recommended; matches the host's built-in panel-button behavior).
  - `openPanel` — always open (or switch to) the panel.

---

## Communication

Extension iframes talk to the host over a message bus: **JSON-RPC 2.0
inside a routing envelope over `postMessage`**:

```json
{ "bus": "plotterExt/1", "msg": { "jsonrpc": "2.0", "...": "..." } }
```

- **Calls** are JSON-RPC requests with a fresh per-call `id` nonce; exactly
  one response with `result` XOR `error`. Protocol errors use the JSON-RPC
  reserved codes; host API errors use implementation-defined codes with a
  stable string in `error.data.reason`.
- **Events** are JSON-RPC notifications whose `method` is a hierarchical
  dot-separated event name. Hosts only forward events a context subscribed
  to via `events.subscribe`; subscription patterns support
  eventemitter2-style wildcards (`*` one segment, `**` any remainder).
- **Connection**: the extension repeats the `bus.ready` notification until
  the host answers with `bus.handshake`:

```json
{
  "host": "freeboard-sk",
  "hostVersion": "2.24.0",
  "apiVersion": "1",
  "capabilities": ["widgets", "panels.iframe", "buttons", "signalk.stream",
                   "signalk.put", "units", "map", "resources",
                   "resources.filter", "ui"],
  "context": {
    "kind": "widget",
    "id": "gauge",
    "instanceId": "b9c1a7e2-4f3d-4c2a-9d1e-7a5b3c8e0f42",
    "targetInstance": null,
    "targetWidget": null
  }
}
```

`context.kind` is `widget` or `panel` (this version). For a configuration
panel, `targetInstance`/`targetWidget` identify the widget being
configured.

The reference implementation of both sides of this protocol is the
[`signalk-plotterext-bus`](https://github.com/joelkoz/signalk-plotterext-bus)
npm package (`/host` and `/extension` entry points). Its README documents
the full wire format; **the documented wire format, not the package, is the
contract** — any conforming implementation interoperates.

---

## Host API (version 1)

| Method | Params | Result |
| --- | --- | --- |
| `events.subscribe` | `{ patterns: string[] }` | `{ subscriptionId }` |
| `events.unsubscribe` | `{ subscriptionId }` | `{}` |
| `state.get` | `{ scope?, keys? }` | `{ values }` |
| `state.set` | `{ scope?, values }` | `{}` |
| `signalk.subscribe` | `{ paths: string[] }` (literal paths) | `{ subscriptionId }` |
| `signalk.unsubscribe` | `{ subscriptionId }` | `{}` |
| `signalk.put` | `{ path, value }` | server PUT response |
| `units.get` | — | `{ units }` |
| `resources.list` | `{ type, query? }` | resource collection |
| `resources.setFilter` | `{ type, filter }` | `{}` |
| `resources.clearFilter` | `{ type }` | `{}` |
| `map.getView` | — | `{ center, zoom, bounds }` |
| `map.center` | `{ position: [lon, lat], zoom? }` | `{}` |
| `map.fitBounds` | `{ bounds: [minLon, minLat, maxLon, maxLat] }` | `{}` |
| `ui.openPanel` | `{ panel }` | `{}` |
| `ui.togglePanel` | `{ panel }` | `{}` |
| `ui.openConfigPanel` | — (widget contexts) | `{}` |
| `ui.toggleConfigPanel` | — (widget contexts) | `{}` |
| `ui.closePanel` | — (panel contexts) | `{}` |

**Host events**

- `state.changed` — `{ scope, instanceId, keys }`: the extension's stored
  state changed (e.g. its configuration panel saved). Published to the
  extension's subscribed contexts.
- `sk.<path>` — `{ path, value, timestamp, $source }`: a subscribed
  Signal K path value, relayed over the host's multiplexed server
  connection (one upstream connection per host, not per widget).
- `filters.changed` — `{ type }`: the extension's display filter for a
  resource type was set or cleared.

### Resource queries and display filters

`resources.list` relays a resource collection request through the host's
authenticated client: `{ type: "notes", query: { position: [lon, lat],
distance: 18520 } }` serializes to the resources API query string. This
keeps extensions inside the host's auth/session semantics; extensions may
still call the server REST API directly (same-origin) when needed.

`resources.setFilter` controls what the host *displays* for a resource
type — it never modifies stored resources:

```json
{
  "type": "notes",
  "filter": {
    "mode": "include",
    "ids": ["urn:mrn:signalk:uuid:..."],
    "match": [ { "path": "properties.skIcon", "op": "eq", "value": "anchorage" } ],
    "label": "Anchorage < 10 nm: 2 matches"
  }
}
```

- `mode` — `include` (show only matching) or `exclude` (hide matching).
- `ids` — resource ids; `match` — AND-combined property conditions with
  `op` one of `eq | ne | lt | lte | gt | gte | in | contains | exists`
  (`contains` is case-insensitive substring for strings, membership for
  arrays; conditions on missing fields are false except `exists`). At
  least one of `ids`/`match` is required; when both are present a resource
  must satisfy both.
- `label` — short human-readable description. **Hosts must surface active
  filters to the user** (the reference host renders clearable chips) and
  let the user clear any filter without opening the owning extension.

The host tracks at most one filter per (extension, resource type); a new
`setFilter` replaces it. Filters from multiple extensions compose by
intersection. Filters are not persisted across host reloads.

### State storage

`state.get`/`state.set` give an extension small host-persisted key/value
storage. Two scopes:

- `instance` — keyed by the context's widget instance (default for widget
  contexts; configuration panels opened with `targetInstance` read and
  write the *target's* instance scope).
- `extension` — shared across the extension's contexts.

Every successful `state.set` triggers a `state.changed` event — the loop
that lets a widget re-render live while its configuration panel edits it.
Quota and persistence backend are host-defined.

### Unit preferences

Signal K values are SI on the wire, and a path's `meta.units` names the
unit. What the *user* wants displayed is host configuration. `units.get`
exposes it:

```json
{ "units": { "speed": "kn", "distance": "naut-mile", "depth": "m", "length": "m", "temperature": "C" } }
```

Vocabulary: `speed` `kn|m/s|km/h|mph`; `distance` `kilometer|naut-mile`;
`depth`/`length` `m|foot`; `temperature` `C|F`. Hosts may add keys;
extensions must tolerate missing ones. Extensions rendering path values
should combine a path's `meta.units` with these preferences to decide which
conversions to offer and which to preselect.

---

## Providing an Extension

A Signal K plugin:

1. Registers a resource provider for the custom type `plotterExtensions`
   (works on current servers — no server upgrade required):

   ```js
   app.registerResourceProvider({
     type: 'plotterExtensions',
     methods: {
       listResources: async () => ({ [PLUGIN_ID]: manifest }),
       getResource: async (id) => { /* ... */ },
       setResource: async () => { throw new Error('read-only') },
       deleteResource: async () => { throw new Error('read-only') }
     }
   })
   ```

2. Serves its widget/panel assets from a **publicly readable** route. The
   server gates all `/plugins/*` routes behind admin authentication, so use
   the standard `signalk-webapp` mechanism (`public/` served at
   `/<package-name>/`) or another route outside `/plugins`. Manifest URLs
   are server-relative; hosts resolve them against the Signal K server
   origin.

3. Declares inter-plugin relationships through the App Store mechanism
   (`"signalk": { "recommends": ["<plugin-name>"] }` in `package.json`)
   rather than hard dependencies — e.g. an extension that searches another
   provider's resources.

---

## Security and Trust

By the time a manifest is visible, the user has already installed a server
plugin — code that runs unrestricted on the server. Install time is the
trust decision; browser-side isolation is **fault containment, not an
adversarial boundary**:

- Baseline iframe sandbox: `allow-scripts allow-same-origin allow-forms`.
  Same-origin assets plus scripts mean the sandbox attribute is not a
  security boundary; its value is lifecycle isolation, CSS/DOM separation
  and crash containment. `allow-top-navigation`, `allow-popups` and
  `allow-modals` are withheld to prevent accidents.
- The host API validates arguments and applies call timeouts; one broken
  extension must not prevent the host from loading.
- Extension contexts are same-origin with the Signal K server and may call
  its REST/WebSocket APIs directly with the user's session where the host
  API does not suffice.

---

## Reference Implementations

- **Protocol**: [`signalk-plotterext-bus`](https://github.com/joelkoz/signalk-plotterext-bus)
  — wire format documentation plus host/extension endpoints with a
  conformance test suite.
- **Extensions**: [`signalk-instrument-widgets`](https://github.com/joelkoz/signalk-instrument-widgets)
  (this repository) — gauge, meter, switch and display-value widgets with a
  shared unit-aware configuration panel — and
  [`signalk-poi-search`](https://github.com/joelkoz/signalk-poi-search) — a
  toolbar button + keepAlive search panel + results widget exercising
  resource queries, display filters and map control.
- **Host**: Freeboard-SK (feature branch, in development) — anchor-area
  widget overlay, placement UI, state storage, multiplexed Signal K relay,
  toolbar buttons, panel drawer, filter chips, map control.

---

## Planned (not part of this version)

The working draft of the broader specification also defines background
runtimes (headless extension contexts) and manifest-declared declarative
filter chains evaluated on every resource fetch. These will be added to
this document as their reference implementations land.
