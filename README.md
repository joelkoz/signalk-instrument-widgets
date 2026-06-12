# signalk-instrument-widgets

Add live instrument widgets to your chartplotter. Works with any chartplotter
that supports Signal K plotter extensions (such as Freeboard-SK).

- **Gauge** — a dial for any numeric value.
- **Meter** — a 0–100% bar for ratio-style values.
- **Switch** — shows an on/off value; tap to toggle it.
- **Display Value** — a clean text readout: a small label on top, the live
  value large in the middle, and an abbreviation below — e.g. "Speed over
  ground" / value / "SOG".

## Using the widgets

In your chartplotter, press and hold an **empty** widget area to add a
widget — its setup panel opens automatically. Press and hold a **placed**
widget to reconfigure or remove it.

Each widget is configured on its own: pick the value to show, choose the
units, and set the range and labels. So you can place two gauges showing two
different values side by side. Your settings are remembered for each widget.

## Demo switch

If your server has no real switches to control (for example a demo or
playback setup), the plugin can provide a demo switch so you can try the
Switch widget anywhere. It is on by default and can be turned off in the
plugin settings.

## License

MIT
