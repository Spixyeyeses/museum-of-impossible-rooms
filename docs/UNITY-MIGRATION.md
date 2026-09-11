# Unity migration: playable native foundation

The browser game remains the reference implementation. `MuseumUnity` is a native Unity project alongside it, using Unity **6000.6.0f1**, URP **17.6.0**, Input System **1.20.0**, and Newtonsoft JSON **3.2.2**. The installed Unity CLI can operate the open Editor; it is optional for ordinary editing.

## Current milestone

The native project now has a playable scene, `Assets/Museum/Scenes/MuseumPlayable.unity`, with first-person movement, collision, scaled and rotated portal traversal, carrying and placing weights, basic exhibit interactions, and live nested portal views. Its menu offers the two-norths gallery, scale cabinet and gravity atrium. See [the playable-version guide](UNITY-PLAYABLE.md) for controls and build instructions.

The separate importer still produces a static cutaway layout of all 27 rooms, 60 portal endpoints, 9 weights and 46 interaction anchors. `CampaignPreview.unity` remains an inspection scene. The playable scene instantiates that layout, adds ceilings and exhibit lights, and drives it from the native simulation. Materials, glass and geometry are placeholders; final art, audio, saves, and full campaign parity remain outstanding.

## Export and inspect

From the repository root:

```powershell
npm run unity:export
npm run unity:check
npm test
```

In Unity, select **Museum > Import Campaign Layout**, then **Museum > Open Campaign Preview**. The preview opens additively, preserving scenes already open. The Hierarchy contains one generated campaign prefab with a separate root for every room. Select a room and press **F** in Scene view to frame it. Select a portal anchor to inspect its source ID, destination, original JSON and initial availability. Its selected gizmo shows inward normal and up direction.

Rooms are spaced on an 80-meter grid solely for inspection. These offsets are not physical distances between rooms and must never feed simulation or portal transforms. Other open scenes may remain visible; use Scene Visibility if needed. The scene has a fixed preview camera, not a first-person controller.

On the very first import, Unity requires untitled scenes to be saved before it can create an additional scene. In that case the prefab import still completes, with a Console message; save your untitled scene, then use **Open Campaign Preview**. The importer never saves or closes your untitled scene automatically.

## Files and ownership

| Location | Purpose |
| --- | --- |
| `src/campaign.mjs` | Authoritative campaign data and existing JavaScript behavior |
| `tools/export-unity-world.mjs` | Validates and exports campaign content without translating behavior |
| `MuseumUnity/Assets/Museum/Content/world.v1.json` | Generated, versioned content snapshot; never edit directly |
| `MuseumUnity/Assets/Museum/Runtime` | Identity anchors and explicit coordinate conversion |
| `MuseumUnity/Assets/Museum/Editor` | Importer and preview geometry generation |
| `MuseumUnity/Assets/Museum/Generated` | Replaceable layout prefab and placeholder materials |
| `MuseumUnity/Assets/Museum/Scenes/CampaignPreview.unity` | Created once; subsequent imports update its prefab without rewriting the scene |
| `MuseumUnity/Assets/Museum/Tests/Editor` | EditMode tests for import fidelity, geometry and safe reimport |

Keep future hand-authored materials, textures, meshes and prefabs outside `Generated`, for example in `Assets/Museum/Art`. The importer owns everything inside `Generated`: editing its prefab or materials directly is temporary and those edits will be replaced. Existing asset `.meta` GUIDs are preserved on reimport. Scene edits and scene-level prefab overrides are retained; avoid overriding generated geometry when testing fresh imports.

The JSON snapshot preserves all source room, portal, object, chapter, art and interaction records, including condition trees and optional fields. The wrapper records a schema version and content hash. `unity:check` fails for a missing or stale export without overwriting it. Unity's importer rejects unsupported schema and broken references; run the full Node validator before changing authoring data.

## Coordinates and preview availability

Source vectors stay in room-local meters. At Unity's presentation boundary, `(x, y, z)` becomes `(x, y, -z)`. Convert direction vectors the same way and construct orientation from converted forward and up vectors. Positions in the source spawn records describe the player's **eye**, not their feet. Portal normals point inward, and portal up can be sideways.

The current preview uses empty initial campaign flags, matching the browser's initial state. Both portal endpoints must be available for an opening to be marked available. Mutually exclusive arrangements retain all anchors but hide the inactive frame. Locked frames get a static blocking panel. All conditions remain intact in `sourceJson`; the preview does not evaluate live gameplay state.

The native portal transform preserves the source engine's rule: destination height divided by source height gives the scale ratio; reverse local right and normal, preserve local up. The Z reflection is a presentation conversion, not a replacement for that transform. Cross-language fixtures verify the native simulation against the browser engine.

## Git workflow

The browser and Unity projects share this repository. Develop on a feature branch, run the content checks and relevant Unity tests, then merge through a pull request. Keep Unity's `Assets` and their `.meta` files, `Packages` including the lockfile, and `ProjectSettings` in Git. Force Text serialization and Visible Meta Files are enabled.

The root `.gitignore` excludes Unity caches, local settings, builds and CLI connection credentials. `.gitattributes` keeps Unity text assets reviewable and routes future textures, models and audio under `Assets/Museum/Art` through Git LFS. Run `git lfs install` when setting up another machine before adding art. Commit asset files and their metadata together. Do not add `Library`, `Temp`, logs or connection-token files.

The browser packaging tool continues to ship only browser files and excludes the Unity project. Node test discovery is scoped to the repository's `tests` directory to avoid running dependency tests inside Unity's cache. See [the release workflow](RELEASING.md) for checks and packaging.

## Next implementation milestones

1. **One finished exhibition:** establish the museum's own visual palette, informed by Portal's clear surfaces, structural rhythm, readable silhouettes and restrained lighting. Add bevels, material roughness and normal detail, baked room lighting, contact shadows, reflection probes, glass and modest post-processing. Do not copy Valve assets.
2. **Campaign parity:** finish conditional geometry and authored art, port notebook and persistence, and match all ten browser campaign replays. Existing basic interaction handlers do not establish full campaign parity.
3. **Native performance and release:** profile CPU/GPU cost and portal recursion on target PCs, add quality presets, and develop the initial Windows preview into a release with a tested save location and packaged assets.

Validate each milestone before expanding visual scope. URP is retained for this foundation; a move to HDRP would be a separate, measured decision after the portal renderer and representative room can be profiled.
