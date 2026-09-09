> **Public-sharing copy.** Machine-specific paths and host-injected identifiers are redacted where present; see [PUBLIC-SHARING.md](PUBLIC-SHARING.md).

# Verification and deliberate limits

This report distinguishes simulation, real browser interactions, rendered replay, visual review, and installation checks. Test results describe the delivered implementation and the observed environment; they are not a universal compatibility or softlock guarantee.

## Environment

Verification used Windows x64, OS build **10.0.26200**, **Node.js v24.19.0**, and **Microsoft Edge 152.0.4191.66**. Actual WebGL 2 rendering used **NVIDIA GeForce RTX 4080**, ANGLE, and Direct3D 11. Browser interface/replay checks used isolated headless browser profiles at 1280 × 800; close-up visual probes used 1440 × 900. The title scene was also opened and inspected in the app's browser preview.

The game requires Node.js **20+** and a desktop WebGL 2 browser. Only the stated Windows/Edge configuration has been verified. macOS, Linux, Firefox, Safari, low-end/integrated GPUs, mobile, touch, VR, and controller support were not tested. There are no runtime network dependencies after prerequisites are installed.

## Functional correctness

The built-in test suite covers reciprocal transforms, repeated traversals, transformed body/cube scale, floor/wall gravity, aperture collision and clearance, long-frame wall sliding, occluded interactions through scaled boundaries, save restoration inside transformed spaces, malformed saves, recovery, fixed socket weights, and campaign progression. Authoring tests reject malformed rooms, links, triggers, dimensions, and unsafe spawns. Server/package tests cover real process launch, paths containing spaces, local-only serving, traversal/hidden-file protection, occupied ports, symlinks, and ZIP/manifest correctness.

The final run passed **92/92 tests**, with zero failed, skipped, or cancelled: 48 engine/campaign, 35 authoring, and nine server/package tests. Exact output is recorded in [unit-final.txt](../evidence/unit-final.txt). The current world validator also passed with zero warnings: 27 rooms, 60 portal endpoints, nine objects, 46 interactions, and ten chapters. Run the same dependency-free suite with:

```text
node --test
node tools/validate-world.mjs
```

[campaign-replay.json](../evidence/campaign-replay.json) records **ten passing chamber solutions** and one continuous route from the actual hub spawn to the departure ledger: **58 portal crossings**, **ten completed indices**, **538.97 simulated seconds**. This route physically returns from annexes, reverses scale and orientation, and walks around furniture. No player position, room, up vector, measure, or puzzle state is reassigned after initial spawn. Scripted aiming is used. The simulated time is not an estimate of human play time.

The [walkthrough](WALKTHROUGH.md) gives every solution, explains the spatial rule, and includes inverse routes, optional note locations, and recovery advice. It identifies which solver routes include hub travel. Reproduce the solver with:

```text
node tests/replay.mjs --out evidence/campaign-replay.json
```

## Playability and interface

[browser-functional.json](../evidence/browser-functional.json) records **17/17 passing real browser interface checks** and their individual outcomes. These exercise fresh onboarding, WASD, both arrow-key look axes, actual mouse movement with pointer capture active, reading a note using E, physically walking through the first hub doorway, graduated hints, modal focus, F3 inspection, preferences, save export/import, invalid import, confirmation before a new visit, and reload. Tests using an assigned quarter-scale or wall-gravity pose are explicitly labelled diagnostic fixtures. An unavailable-WebGL fixture verifies visible launch guidance. The bundled interface report comes from the clean candidate extraction on the documented alternate port 4183.

An independent [gameplay review](GAMEPLAY-REVIEW.md) checked the implemented clues, solutions, returns, and recovery against source. Wrong-measure sockets keep the weight, completed sockets cannot be emptied, perspective connections remain settled, and arrangement changes require explicit release followed by looking away at a safe distance. No time limit, death, consumable key, or irreversible failed puzzle condition is used.

Observed faults fixed during development included completed weights falling or remaining reusable, numeric progression disappearing on reload, an archive recovery point inside glass, furniture without matching collision, and interaction hotkeys still working while the read-only inspector was open. Tests were extended around these observed failures.

This is not broad human playtesting. The full campaign route is a deterministic solver, and real keyboard interface checks cover selected interactions rather than a human-paced ten-chamber playthrough. Difficulty, enjoyment, and comfort across a varied player population remain unverified.

## Rendered experience and presentation

[rendered-replay.json](../evidence/rendered-replay.json) runs the continuous campaign input stream in the actual browser/WebGL game. Rendering is sampled immediately before and after crossings, after interactions/restoration, and at completion. It does not merely render independently assigned room poses. The report records source hashes, sample poses, graphics errors, rendering costs, reached rooms, and the ending. Its screenshot set contains the actual rendered campaign.

The definitive run passed all ten chapters and 58 crossings, reached all 27 room cells, and produced 161 sampled views and 128 screenshots. Every sample returned WebGL error zero. None of the crossing samples was a flat image; 63 actual framebuffer pixels were read at each sample. The observer saw 5,380 rendered frames, with at most 12 views in a frame (below the cap of 13). Recorded game source hashes stayed unchanged during the run. Median sampled render-plus-GPU-completion time was 0.50 ms, 95th percentile 1.60 ms, maximum 2.90 ms on the stated hardware.

The replay uses ordinary engine movement and traced interactions but accelerates simulation between the sampled views; it is not a frame-by-frame video or human keyboard recording. Framebuffer colour sampling detects flat blank crossing frames in addition to checking WebGL errors.

[visual-probes.json](../evidence/visual-probes.json) separately records **20 diagnostic viewpoints**: initial/evolved hub; ordinary, oblique, upward-angled, millimetre, ten-micron, and exactly-on-plane portal views; a carried cube straddling a boundary; a quarter-scale passage and interior; both unobserved arrangements; perspective before/after; wall-floor viewing and its rotated connection; and the open courtyard. These use assigned poses and are explicitly not campaign solution evidence. Close-up portal samples require varied pixels from actual architecture, not a uniform fallback image.

Actual screenshots were inspected. Corrections included portal colour conversion, coplanar inactive surfaces, oversized quarter-scale plinths, mathematically misaligned perspective frames, wall-marker orientation, inconsistent held-object poses, missing aperture views at grazing/very close angles, and depth flicker at the crossing plane. The ending now visibly opens into a sky-lit courtyard with planting, a departure ledger, and tea set for two.

The final visual contact sheet is `evidence/visual-review-contact.png`; individual frames are in `evidence/visual-probes/` and `evidence/rendered-replay/`. These development screenshots remain in the source workspace and are excluded from the compact release ZIP. The tools recreate them with an externally supplied Playwright package. The bundled generated artwork is a curator's conceptual print, not a claimed gameplay screenshot; [asset provenance](ASSETS.md) records its origin.

## Audio

The browser checks start the actual Web Audio graph through a user gesture and exercise volume controls. The visual probe run additionally samples its real analyser output after an event chord: a running **48 kHz** context, nonzero signal, and peak amplitude below clipping. Exact RMS and peak are recorded in the JSON report.

No subjective listening test or hardware-speaker test was performed. The score is generated locally from quiet oscillators, with event chords and footsteps. Important events also have visible feedback. There are no remote audio assets.

## Robustness and recovery

Tests include repeated crossings, inverse measure loops, supported-scale rejection, attempts to interact through blocked or inactive boundaries, unsafe drops, hidden collected exhibits, recall of misplaced weights, socket persistence, and malformed save restoration. The continuous solver restores saves at transformed and partially completed points. Four additional regressions recover weights left in the inactive chamber 4/8 annexes, recover at OPEN/HOLD/RELEASE and then reach the ledger, and retain a refused wrong-size weight before physically correcting its measure and completing its index.

The game retains an always-available **R** recovery and notebook return-to-court action. These restore a safe normal-size/normal-up entrance and recall loose weights while keeping completed displays and discoveries. A preserved arrangement may require using its release stand to show the collection side again; the walkthrough explains this. Save files can be exported before a new visit.

These checks establish specific recoverable routes and regression cases, not an exhaustive proof over every possible action sequence or corrupted browser environment. Browser storage belongs to the profile and exact origin; changing port/host or clearing storage changes save availability. There is no cloud backup.

## Performance

Rendering has an explicit ceiling of **12 offscreen views plus the current room**, two nested doorway levels at Full quality and one at Light. Immediate visible doorways reserve slots before deeper views. Offscreen targets are capped at **1280 × 900**, with resolution factors of .85 (Full) and .65 (Light). Main-canvas pixel ratio is capped at 1.5, or 1 in Light mode. Simulation subdivides movement into at most 1/90-second steps and caps a submitted frame at .1 second. Interaction rays traverse at most four boundaries; movement has its own eight-crossing bound per integration operation.

The visual-probe report contains eight measured cases: hub, first gallery, large archive, and wall observatory in both quality modes. Each has eight warmup renders followed by 45 timed renders and GPU completion synchronization. On the stated RTX 4080 setup, that recorded run's median sample costs range from **0.2 to 2.0 ms**, and its highest 95th-percentile case is **3.1 ms**. These are synchronized diagnostic render costs, not ordinary FPS, a minimum hardware specification, or a cross-device performance promise. The complete replay separately records its own timing distribution and maximum observed view count.

## Installation reliability

The launch/package tests use the actual local server process and verify portable file selection and checksums. After the 92-test full run, the server gained a process-ID diagnostic for precise verification cleanup; all nine launch/package tests passed again. Game source was unchanged. The release is a complete source folder with no `npm install` step. Its external prerequisite is Node.js; Node and a browser are intentionally not copied from the development machine.

The clean candidate passed all 41 manifest digests, eight served resource hashes, all 17 fresh-profile browser checks, and precise shutdown of its temporary server. It used the shipped Windows launcher from an unrelated working directory and a new extracted path containing spaces, on the documented alternate port 4183. The final ZIP is extracted and launched again after documentation/evidence updates. Its installation outcome and archive SHA-256 are recorded in **the sanitized [`evidence/clean-install-verification.json`](../evidence/clean-install-verification.json) historical record**, rather than embedding a checksum of an archive inside itself. Any reused candidate browser evidence is explicitly identified there and requires identical runtime, assets, tools and test digests. [INSTALL.md](INSTALL.md) provides the same launch instructions and practical troubleshooting.

The host antivirus injected a Kaspersky script into local HTTP pages during testing. Browser verification distinguishes that host-injected traffic from game resources and blocks it within the isolated test context. It does not disable or modify antivirus settings. Game resources load locally; the verifier reports game errors and resource failures separately.

## Deliberate visual and product limits

- Beyond the chosen doorway recursion depth, further apertures show dark glass. Portal images can be softer than the main view. These limits are visible on long chains of aligned doors; nearby traversal remains live.
- A destination clip plane cuts a five-millimetre slice at ordinary doorway scale. At an exact boundary, a render-only half-millimetre adjustment at visitor scale keeps the aperture numerically stable. Simulation, collision, saves, and interaction positions do not receive that adjustment.
- Lighting uses room-local illumination, a shared environment, procedural materials, and simple contact shadows. There are no recursive real-time shadow maps or physically simulated light transport through portals. Destination lighting is visible before crossing; object lighting follows its current room.
- Collision is an oriented cardinal box, not a rounded capsule. Floors, walls, puzzle barriers, weights, stands, and courtyard furniture collide. Thin trim, hanging art, clouds, and decorative ring sculptures do not each have a separate physical simulation.
- Authored gravity uses controlled floor/wall orientations, not freely rotating arbitrary gravity. Supported visitor measure is **1:16 through 4:1**. Further shrinking/expansion is rejected with recovery advice.
- The hub changes access, illumination, index displays, suspended details, and its final north doorway within a fixed footprint. The earlier design proposal's growing wings and balcony were not implemented.
- The final campaign uses one OPEN weight followed by HOLD and RELEASE conditions. It combines learned spatial rules without an ordering trap. The historical proposal is retained under `docs/design/` and is explicitly not the implemented specification.
- Authoring is a reusable data format plus validator and read-only inspector. There is no in-game drag-and-drop geometry editor. Text is English; no localization or screen-reader equivalent of the 3D puzzles is included.

## Reproducing the rendered checks

Start the game server, then supply an existing Playwright package and Chromium-family browser executable. These are optional verification prerequisites and are not bundled or needed for play:

```text
node tools/browser-verify.mjs --playwright-dir "PATH TO PLAYWRIGHT PACKAGE" --browser "PATH TO BROWSER EXECUTABLE" --url http://127.0.0.1:4173/ --screenshots
node tools/render-replay.mjs --playwright-dir "PATH TO PLAYWRIGHT PACKAGE" --browser "PATH TO BROWSER EXECUTABLE" --url http://127.0.0.1:4173/ --screenshots
node tools/visual-probes.mjs --playwright-dir "PATH TO PLAYWRIGHT PACKAGE" --browser "PATH TO BROWSER EXECUTABLE" --url http://127.0.0.1:4173/?test=1
```

Each command writes a structured evidence report and returns a failing exit status if its assertions fail. Source tests, campaign replay, validator, local server, and ZIP creation use Node's built-in modules only.


For this public copy, the historical installation record describes the original local archive. Repository documentation is sanitized and README metadata is adapted; runtime files are unchanged. See [PUBLIC-SHARING.md](PUBLIC-SHARING.md) before describing a separately rebuilt public archive as the original verified ZIP.
