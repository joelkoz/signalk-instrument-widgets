# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Reference the `signalk-plotterext-bus` build dependency by its published npm
  version (`^0.5.0`) instead of a local `file:` path, so the project installs,
  builds, and tests cleanly from a fresh clone (it previously only resolved
  against a sibling working copy).

### Added
- SignalK plugin-CI workflow (`.github/workflows/signalk-ci.yml`) that runs the
  shared cross-platform test matrix.
- This changelog.

## [0.5.2]

### Added
- App icon and app-store screenshot.

### Changed
- README rewritten to be user-facing.
- Removed the plugin from the webapps menu — it is a chart-plotter extension
  (plotterExtensions), not a standalone web app.

## [0.5.0]

### Added
- Initial release: gauge, meter and switch instrument widgets for Signal K
  chartplotters that support the `plotterExtensions` resource type. Registers a
  read-only plotterExtensions provider and serves widget assets.
