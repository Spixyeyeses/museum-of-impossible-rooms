# The Museum of Impossible Rooms

A first-person spatial puzzle adventure in ten exhibitions. Follow missing curator Iona Vale's notes through 27 connected spaces, learn six consistent rules of impossible architecture, and assemble a route to an exit that does not exist when you arrive.

Quiet, curious, and slightly uncanny. No combat, jump scares, death, or time limit.

Source repository: [Spixyeyeses/museum-of-impossible-rooms](https://github.com/Spixyeyeses/museum-of-impossible-rooms).

## Unity Windows preview

[Download v1.1.0-unity-preview.1](https://github.com/Spixyeyeses/museum-of-impossible-rooms/releases/tag/v1.1.0-unity-preview.1) for the native Unity edition. Extract **Museum-Unity-1.1.0-unity-preview.1-Windows-x64.zip**, then run **Museum of Impossible Rooms.exe**. Keep the entire extracted folder together. Unity and Node.js are not required to play this download.

This preview adds native portal traversal, nested portal views, carrying, scale and gravity mechanics, and the doorway/lighting stability fixes. It includes entry points for the Gallery of Two Norths, Scale Cabinet and Gravity Atrium. **Placeholder art, no saved progress, and incomplete campaign parity:** the original browser edition below remains the complete ten-exhibition version.

Developers: open **MuseumUnity** from Unity Hub using **6000.6.0f1**, then choose **Museum > Open Playable Scene**. See [controls and preview limits](docs/UNITY-PLAYABLE.md), [the migration guide](docs/UNITY-MIGRATION.md), and [release changes](CHANGELOG.md).

## Browser edition — download and play

1. Open [release v1.0.0](https://github.com/Spixyeyeses/museum-of-impossible-rooms/releases/tag/v1.0.0) and download **Museum-of-Impossible-Rooms.zip**.
2. Install **Node.js 20 or newer** if needed, then extract the entire archive.
3. On Windows, double-click **Start Museum.cmd** and keep its console open. The browser opens at **http://127.0.0.1:4173/**.

You can also clone this repository or use GitHub's **Code → Download ZIP**, then launch from the source folder:

```text
node tools/serve.mjs
```

No `npm install`, account, paid service, or internet connection is needed to play after Node.js is installed. Use a desktop WebGL 2 browser, keyboard, and mouse. **Windows with Edge is the verified platform**; other platforms and browsers remain unverified. [Installation and troubleshooting](docs/INSTALL.md).

**Controls:** WASD walks; mouse or arrows look; E reads/uses/takes; Q sets down; H gives graduated hints; J opens the notebook; R recovers safely; Escape pauses; F3 opens the spatial inspector. Progress saves locally, with export/import and reset controls in the notebook.

## What's included

- Ten puzzle chapters combining linked spaces, oversized interiors, changing scale, unobserved rearrangement, perspective connections, and controlled gravity.
- Optional exhibits, curator notes, a completed ending, a reusable authoring format, and a read-only spatial inspector.
- Complete source, local assets, a vendored Three.js build and its MIT license, procedural audio, and an original generated museum print.

## Verification and guides

The browser v1.0.0 build passed **92 source tests** and **17 real browser interface checks**, including actual mouse movement with pointer lock. A deterministic continuous campaign completed all ten indices and **58 crossings**. Its browser-rendered replay visited all **27 spaces**, sampled **161 views**, and found no flat crossing frames or WebGL errors. A separate clean extraction verified file digests, launcher behavior, resource loading, and cleanup.

These results came from Windows, Node.js v24.19.0, Edge 152, and an RTX 4080. The complete route is an accelerated deterministic replay, **not a human-paced ten-chamber playthrough**. Broader hardware compatibility, difficulty, enjoyment, and comfort remain unverified. Doorway rendering has bounded depth and resolution; see the [verification report and deliberate limitations](docs/VERIFICATION.md).

- [Complete walkthrough — spoilers](docs/WALKTHROUGH.md)
- [Room and connection authoring](docs/AUTHORING.md)
- [Asset provenance and third-party license](docs/ASSETS.md)
- [Public-copy sanitation notes](docs/PUBLIC-SHARING.md)

Run the dependency-free tests and validator:

```text
node --test
node tools/validate-world.mjs
```

Optional browser verification tools require an existing, separately supplied Playwright package and browser executable. They are not required to play.
