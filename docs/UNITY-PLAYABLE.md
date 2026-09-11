# Playable Unity preview

This milestone brings the museum into a native Unity player. It is a mechanics and rendering preview, with placeholder architecture and materials. The polished art pass and full ten-chapter conversion come next.

## Run it

- **Windows player:** download **Museum-Unity-1.1.0-unity-preview.1-Windows-x64.zip** from [v1.1.0-unity-preview.1](https://github.com/Spixyeyeses/museum-of-impossible-rooms/releases/tag/v1.1.0-unity-preview.1), extract the complete archive, and run **Museum of Impossible Rooms.exe**. Keep the executable beside its Data folder, UnityPlayer.dll, and all other build files. Unity and Node.js are not required.
- **Unity Editor:** choose **Museum > Open Playable Scene**, press **Play**, then click **Continue visit**. Unity offers to save any modified scenes before opening this scene. Choose **Museum > Open Campaign Preview** separately when inspecting the imported room layout.
- **Rebuild:** choose **Museum > Build Windows Player**. It builds the playable scene explicitly into `Builds/Windows`.

The first exhibition starts in the Gallery of Two Norths. The menu also lets you begin the Scale Cabinet and Gravity Atrium. Selecting an exhibition starts a fresh visit; this preview does not save progress between launches.

| Control | Action |
| --- | --- |
| WASD / mouse | Walk / look |
| Left Shift | Walk faster |
| E | Examine, use, or pick up a weight |
| Q | Place the held weight |
| H | Open the exhibition hint |
| R | Recover at the exhibition entrance and recall loose weights |
| Escape | Open the menu or close a note |

The hint currently gives the final source hint directly. Graduated hints and the original notebook are not implemented yet.

## Implemented behavior

- The C# simulation retains room-local coordinates, custom body collision, arbitrary cardinal gravity, aperture-derived scale, portal-aware interaction rays, and the source hand-placement rules. Unity transforms and the room inspection grid never feed simulation distances.
- Ordinary, quarter-scale and sideways portals transform the visitor, motion and carried weight together. Tiny float rounding at an arrival boundary is snapped inside the room; strict collision bounds still prevent accumulating floor penetration.
- URP renders destination rooms live, with exit-plane clipping, two recursion levels, a 12-view budget, and visibility checks. Destination rooms are resident, avoiding asset loading during a crossing.
- A weight intersecting a portal gets clipped geometry in both rooms, with matching clipped shadow passes. It remains one simulation object.
- Runtime ceilings, light fittings, exhibit stands and real shadows replace the cutaway inspection presentation. The source room geometry remains editable through the content export/import workflow.
- Raised doorway thresholds avoid competing floor faces. Stable camera clipping, per-room lights, downward shadowed fixtures, and matching multisample antialiasing improve doorway transitions. See [the visual fixes](UNITY-VISUAL-FIXES.md) for scope and verification.
- Notes, sockets, gravity controls, collected plates, and basic alignment/arrangement flags are wired to native input. Only the listed acceptance scenarios have been verified as complete routes.

## Validation

`npm test` runs browser regression tests plus content/fixture export tests. `npm run unity:fixtures` regenerates the expected values from the actual browser engine; `npm run unity:fixtures:check` detects drift without overwriting. Fixtures cover six directional transforms and ten simulation scenarios, including carried scale, collision, camera look, gravity, pickup and dropping.

Unity's **Museum.Editor.Tests** assembly checks imported content, portal view math, native fixture agreement and traveller geometry. **Museum.PlayMode.Tests** checks initialized room presentation, live render textures, carried scaled traversal, wall-gravity camera orientation, socket/recovery behavior, and chapter 1's full route. That full route only changes view direction and movement inputs after the authored spawn; its four crossings and final socket placement use normal simulation and interaction APIs.

The optional standalone argument `--museum-smoke-test` checks the packaged game's shader support and live rendered image content, writes `smoke-report.json`, `smoke-portal.png`, and `smoke-view.png` beside the executable, then exits. It has no effect on normal visits. This verifies player packaging in addition to Editor tests.

`--museum-visual-audit` also captures the frames around ordinary, quarter-scale and wall-gravity crossings in both directions, looking straight and diagonally. Reports and images go in `visual-audit` and `visual-audit-angled` beside the executable; the process exits unsuccessfully if a view goes dark or the central image changes abruptly at a crossing.

## Current limits

- This is not the final art direction. There are no finished surface textures, sculptural assets, baked lighting, authored reflections or audio yet.
- The full campaign has not been accepted in Unity. Some initially unavailable geometry and authored art are omitted by the static importer; later arrangement puzzles need a dedicated runtime presentation pass before claiming full parity.
- Recursion ends with a dark fallback. Portal textures use linear HDR color and up to 4× MSAA, with no destination depth/motion-vector composition or temporal AA. Screen-space ambient occlusion is disabled until it supports the portal projection correctly; actual light shadows remain enabled.
- Traveller clipping handles one aperture per weight at a time. Lighting does not travel through the museum's portal topology.
- Saves, browser-save import, a notebook, configurable bindings and quality settings are not included. The initial menu is a functional preview interface.
- The Windows player and its smoke run validate this machine. Broader hardware, performance and distribution testing remain ahead.

This preview is published as [v1.1.0-unity-preview.1](https://github.com/Spixyeyeses/museum-of-impossible-rooms/releases/tag/v1.1.0-unity-preview.1); see [the release workflow](RELEASING.md).
