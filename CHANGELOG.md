# Changelog

## v1.1.0-unity-preview.1 — 2026-09-11

First downloadable Unity preview alongside the existing browser game.

- Added a Unity 6000.6.0f1 / URP 17.6.0 project, native C# simulation, first-person controls, scaled and rotated traversal, live nested portal rendering, carried-weight clipping, and basic exhibit interactions.
- Added reproducible campaign/fixture exports, import tools, Editor and Play Mode suites, and standalone visual diagnostics. All 27 room records are imported; only the listed native scenarios are accepted.
- Fixed coplanar doorway thresholds, close-range portal disappearance, inconsistent room lighting, ceiling shadow artifacts, and small wall seams. Portal and player views use up to 4× MSAA; incompatible screen-space AO is removed.
- Added release documentation and automated browser/content checks.

Validation: 101 Node tests; 42 Editor tests; 8 Play Mode tests; 96 standalone visual poses. Unity rendering was verified on Windows with an RTX 4080.

Preview limits: placeholder materials, bounded portal recursion, incomplete campaign presentation, no saves/notebook/audio/quality presets.

## v1.0.0 — 2026-09-09

Original complete browser edition: ten exhibitions, offline package, procedural audio, saves/notebook, and browser verification. Its release and download remain available.
