# The Museum of Impossible Rooms

A first-person spatial puzzle adventure in ten exhibitions. Follow missing curator Iona Vale's notes through 27 connected spaces, learn six consistent rules of impossible architecture, and assemble a route to an exit that does not exist when you arrive.

Quiet, curious, and slightly uncanny. No combat, jump scares, death, or time limit.

Source repository: [Spixyeyeses/museum-of-impossible-rooms](https://github.com/Spixyeyeses/museum-of-impossible-rooms).

## Download and play

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

The verified build passed **92 source tests** and **17 real browser interface checks**, including actual mouse movement with pointer lock. A deterministic continuous campaign completed all ten indices and **58 crossings**. Its browser-rendered replay visited all **27 spaces**, sampled **161 views**, and found no flat crossing frames or WebGL errors. A separate clean extraction verified file digests, launcher behavior, resource loading, and cleanup.

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
