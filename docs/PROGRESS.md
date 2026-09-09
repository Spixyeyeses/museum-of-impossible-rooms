> **Public-sharing copy.** Machine-specific paths and host-injected identifiers are redacted where present; see [PUBLIC-SHARING.md](PUBLIC-SHARING.md).

# Museum development record

## Delivery intent
A complete local first-person WebGL game, with ten puzzle chambers, a changing hub, six interacting spatial rules, offline assets, save/recovery, authoring data and developer inspection. Desktop keyboard/mouse is the supported target. No hosting, account, service or purchased asset is required.

## Plan
1. Inspect runtime; establish portable local package. **Complete**
2. Build deterministic spatial simulation and a rendered playable core. **Complete**
3. Integrate ten chambers and evolving hub; hints, lore and ending. **Complete** — 27 room cells, 60 portal endpoints.
4. Presentation, sound, onboarding, comfort settings and developer view. **Complete**
5. Distinct correctness, usability, presentation, robustness, performance and clean-install reviews. **Complete** — results and limits in `VERIFICATION.md`.
6. Package source/assets, reproduce solutions, report evidence and limitations. **Source and release build complete** — the companion `release/clean-install-verification.json` records the exact delivered archive's extraction/launch audit and digest.

## Decisions
- 2026-09-09: Empty workspace. Node and browser automation available. Use a local browser game with a vendored Three.js renderer and a dependency-free local server. Simulation is independent of browser rendering.
- Each room owns local coordinates. Reciprocal framed connections transform position, direction, up, velocity and scale. Portal views are live renders; finite recursion is an explicit rendering budget.
- Recovery is always accessible, retains collected understanding, and recalls loose objects. No consumable critical items or irreversible failed puzzle states.
- Perspective connections settle after a 1.1-second valid viewpoint and remain open. Unobserved changes require explicit release, a fully averted view and an unoccupied doorway. This keeps the rule legible and prevents eye-contact timers during traversal.
- Ten chapters unlock sequentially. Nine restored indexes create the finale entrance in the north wall. The hub keeps its physical footprint; displays, lighting, hanging details and final door evolve.
- Full rendering uses two nested doorway levels; Light uses one. At most 12 offscreen views (13 including current room), each capped at 1280×900. Immediate visible doors reserve rendering slots before deeper views.
- One original generated architectural print is bundled for the curator’s optional art displays. Architecture, puzzle objects, textures and audio are otherwise generated locally by the game.
- Final close-up review: test the full doorway aperture against the view frustum, stabilize the render eye within half a millimetre of a boundary, and inset the destination clip plane five millimetres at ordinary doorway scale. This fixes blank/flickering exact-plane frames while leaving simulation and saved poses untouched. Pixel checks now supplement graphics-error checks.
- Launch verification uses the server's own reported process ID to close only its temporary server. No process-tree enumeration or system-policy changes are needed.

## Evidence
- Final full suite: **92/92 pass** — 48 engine/campaign, 35 authoring, nine launch/package tests. The nine launch tests also passed again after adding precise test-server cleanup diagnostics.
- Continuous hub-to-ledger simulation: ten chapters, 58 crossings, 538.97 simulated seconds; no position assignments after initial spawn. Includes transformed saves and real collision around furniture. Added recovery cases pass for inactive annexes, every partial finale phase, and a rejected wrong-measure weight subsequently corrected by its real route.
- Authoring: 35 validator tests pass; malformed links, frames, dimensions, spawns and conditions are checked. Validator caught and corrected an archive spawn inside its glass wall.
- Launch infrastructure: 9 tests pass; paths with spaces, traversal protection, actual CLI process launch and Windows ZIP extraction tested.
- Browser UI: **17/17 pass** in fresh headless Edge 152.0.4191.66 on Windows, including actual keyboard and mouse/pointer-lock controls, note reading, chapter01 entry, hints, read-only inspector, save export/import and transformed reload fixtures. Zero game runtime errors. Host antivirus injected traffic was separately identified and blocked in the offline test context.
- Rendered full campaign: **all ten chapters, 58 crossings and 27 rooms pass**, 161 sampled views and 128 screenshots. No flat crossing frames, no graphics errors, source hashes unchanged during the definitive replay. An observer sampled 5,380 actual rendered frames, at most 12 views per frame.
- Visual/performance/audio: **20 viewpoint probes and eight benchmark cases pass**. Inspected exact-boundary, oblique, quarter-scale, straddling-cube, wall-floor and courtyard images. Measured the actual browser audio graph's nonzero unclipped signal; no subjective listening test. `VERIFICATION.md` distinguishes synchronized render costs from FPS.
- Clean candidate: Windows extraction into a new folder with spaces verified 41 manifest files and eight served resource hashes. The shipped command launcher ran from an unrelated directory, fresh browser checks passed 17/17, and the temporary server shut down afterward. The final archive is checked again after these documentation updates; its companion release record is authoritative for its exact hash and outcome.
- Actual screenshots inspected: start scene; live rotated portal at normal and near-plane distance; quarter cabinet; wall gravity; changed summer connection; open-sky courtyard. Fixed wrong portal colour conversion, overlapping pilasters, coplanar inactive portal surfaces, wall-mark placement, mathematically incorrect perspective frames and oversized small plinth rendering.
- Working checkpoint: `release/checkpoint-core.zip` created before renderer/presentation changes.

## Known limits and continuity
No observed implementation blocker remains. Deliberate limits include finite portal recursion and resolution, cardinal-box collision/gravity, bounded measure, a fixed-footprint evolving hub, and a data-based authoring workflow rather than a live geometry editor. All are described in `VERIFICATION.md`.

Broad human playtesting, subjective/hardware audio listening, low-end GPU testing and other operating systems/browsers remain unverified. Future changes should preserve the passing campaign/recovery routes and repeat the relevant tests plus rendered boundary probes. The final release audit is kept outside the archive so it can identify that exact ZIP without a circular self-checksum.
