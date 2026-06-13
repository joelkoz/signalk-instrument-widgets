// Build the widget/panel web assets into public/, which the plugin serves as
// a top-level static route at /plotterext/signalk-instrument-widgets/.

import { build } from 'esbuild'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')
mkdirSync(join(pub, 'js'), { recursive: true })

const entries = ['gauge', 'meter', 'switch', 'display', 'config']

await build({
  entryPoints: entries.map((name) => join(root, 'src/web', `${name}.js`)),
  bundle: true,
  format: 'iife',
  outdir: join(pub, 'js'),
  sourcemap: true,
  target: ['es2020'],
  logLevel: 'info'
})

cpSync(join(root, 'src/web/instruments.css'), join(pub, 'instruments.css'))

// Static assets (e.g. the app-store icon) ship under public/assets/ so the
// server's icon probe resolves signalk.appIcon ("assets/...") via the
// published tarball's public/ directory.
cpSync(join(root, 'src/web/assets'), join(pub, 'assets'), { recursive: true })

const page = (name, bodyClass, title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="instruments.css">
</head>
<body class="${bodyClass}">
<div id="root"></div>
<script src="js/${name}.js"></script>
</body>
</html>
`

writeFileSync(join(pub, 'gauge.html'), page('gauge', 'widget', 'Gauge'))
writeFileSync(join(pub, 'meter.html'), page('meter', 'widget', 'Meter'))
writeFileSync(join(pub, 'switch.html'), page('switch', 'widget', 'Switch'))
writeFileSync(
  join(pub, 'display.html'),
  page('display', 'widget', 'Display Value')
)
writeFileSync(
  join(pub, 'config.html'),
  page('config', 'panel', 'Instrument Setup')
)

writeFileSync(
  join(pub, 'index.html'),
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Instrument Widgets</title>
<link rel="stylesheet" href="instruments.css"></head>
<body class="panel">
<div id="root">
<h2>Instrument Widgets</h2>
<p class="status">This package provides gauge, meter, switch and display
widgets for chartplotters that support the Signal K
<code>plotterExtensions</code> resource type (e.g. Freeboard-SK). There is
nothing to configure here: in your chartplotter, press and hold an empty
widget area to add a widget, and press and hold a placed widget to
configure it.</p>
</div>
</body>
</html>
`
)

console.log('public/ assets written')
