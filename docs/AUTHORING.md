> **Public-sharing copy.** Machine-specific paths and host-injected identifiers are redacted where present; see [PUBLIC-SHARING.md](PUBLIC-SHARING.md).

# Authoring impossible rooms

The game separates a declarative world from its simulation, rendering, and interface:

- `src/campaign.mjs` authors rooms, reciprocal connections, weights, interactions, chapter text, and puzzle flags.
- `src/engine.mjs` owns movement, collision, portal transforms, gravity, carrying, interaction rays, and save restoration.
- `src/render.mjs` displays that same world and the simulation's object poses.
- `src/main.mjs` supplies controls, notebook, hints, menus, and the read-only spatial inspector.

The small `room`, `arch`, `link`, `obj`, `socket`, `align`, and `shutter` helpers in the campaign file produce ordinary objects and arrays. The exported `world` is the reusable authoring format. New spatial arrangements should use that format and the existing mechanics rather than add a room-name exception to the engine.

## Coordinates and room cells

Each room has its own local metre coordinates. Two connected rooms do not need compatible global positions. Vectors are arrays `[x, y, z]`. Ordinary up is `[0, 1, 0]`; the east-wall floor uses `[-1, 0, 0]` as up. Player positions are **eye positions**, normally 1.6 m above the supporting floor times player scale.

```js
{
  id: 'example-hall',
  name: 'A Hall with Two Endings',
  chapter: 1,
  bounds: { min: [-6, 0, -8], max: [6, 6, 8] },
  spawn: { p: [0, 1.6, 5], forward: [0, 0, -1], up: [0, 1, 0] },
  solids: [
    { id: 'glass-divider', min: [-6, 0, -3], max: [6, 6, -2.8], material: 'glass' }
  ],
  art: [],
  accent: 0x8bbcc4
}
```

Bounds and solids are axis-aligned boxes. A room's safe spawn must fit the entire standing body, not just the eye point: the ordinary body extends 1.6 m below and 0.2 m above the eye, with radius 0.24 m; all of these dimensions scale with the player and rotate with cardinal up. The validator caught and corrected an archive spawn inside its glass divider using this test.

`solids[].requires` can conditionally enable geometry, but never use it to remove the occupied support floor or seal the only return route. Authored furniture colliders use the same solids array. Decorative `art` does not itself create collision geometry. `openSky: true` omits the roof and selects the courtyard presentation; the cell's simulation bounds remain finite.

## Reciprocal spatial connections

Every passage is a pair of endpoints. Its `normal` points **into its own room**, toward the side from which the endpoint can be entered. `up` identifies the top of its aperture; the right axis is `cross(up, normal)`. Normal and up must be normalized, orthogonal cardinal vectors.

```js
[
  {
    id: 'measure-in', room: 'large-hall', to: 'measure-out',
    center: [0, 1.8, -8], normal: [0, 0, 1], up: [0, 1, 0],
    width: 2.6, height: 3.6, label: '1 : 2'
  },
  {
    id: 'measure-out', room: 'small-gallery', to: 'measure-in',
    center: [0, 0.9, 7], normal: [0, 0, -1], up: [0, 1, 0],
    width: 1.3, height: 1.8, label: '2 : 1'
  }
]
```

The scale factor is `destination.height / source.height`. Both endpoints must have the same width/height ratio, so the transformation is uniform. The example halves the player, carried weight, local movement distances, and reach when crossed forward; its inverse doubles them. There is no separate portal scale field to keep in sync. A neutral return has equal-sized endpoints.

The transform flips local right and normal, preserves local up, then maps into the destination frame. A different destination up rotates the traveller and gravity basis coherently. Keep apertures large enough for the player body and any required carried object at the intended scale. The supported player-scale range defaults to 1/16 through 4; crossing beyond it is rejected, with recovery available.

An endpoint may lie on a room wall or stand inside a room. Wall apertures must face inward and fit the room bounds. Freestanding backs are solid; return travel uses the reciprocal endpoint. Do not author a third endpoint that points one-way into an existing pair.

## Conditions and persistent flags

Conditions control actual passage availability and visible geometry. Both ends of a portal must satisfy their conditions before it can be rendered or traversed as open.

| Authoring value | Meaning |
|---|---|
| absent, `null`, `true` | Available |
| `false` | Unavailable |
| `'final-open'` | That state flag is truthy |
| `['final-open', 'final-hold']` | Both conditions are true |
| `{ all: ['final-open', 'final-hold'] }` | Both conditions are true |
| `{ any: ['route-a', 'route-b'] }` | At least one condition is true |
| `{ not: 'summer' }` | The summer flag is false |

Use one operator per condition object. `hideInactive: true` hides an inactive endpoint's entire frame and surface; this is required for two arrangements that share exactly the same physical frame. The normal locked door presentation can remain visible when `hideInactive` is omitted.

`state.flags` holds puzzle state. Chapter completion adds its numeric ID to `state.solved` and sets `solved:N`; the next hub entrance depends on that flag. Keep room, object, portal, and interaction IDs stable when changing content intended to use existing saves. Schema-breaking changes need a deliberate save migration/version decision.

## Weights and interactions

Weights are cubes. `size` is the full side length in room-local metres. `home` defines the reset/recall location and original size.

```js
{
  id: 'example-weight', room: 'large-hall', p: [2, 0.4, -2], size: 0.8,
  label: 'Index weight', color: 0xcaab64,
  home: { room: 'large-hall', p: [2, 0.4, -2], size: 0.8 }
}
```

Every interaction has `id`, `room`, `p`, `type`, and a label. `radius` is the interaction target radius, not a collision volume. Interaction tracing respects room solids, portal transforms, scaled distance, and a bounded number of traversed frames. A finished socket locks its weight in place, excludes it from gravity and pickup, and preserves the completion flag through recovery.

| Type | Required additional fields | Behavior |
|---|---|---|
| `socket` | `acceptSize`, `flag` | Accepts the carried weight at the requested size, locks it, and sets the flag. Wrong size remains in hand. |
| `note`, `lore` | `title`, `text` | Opens readable text and records it in the notebook. Lore is optional. |
| `memory` | `flag` | Collects a plate without a weight. `hideFlag` can hide its model afterward. |
| `gravity` | cardinal `up` | Toggles between ordinary floor-up and the authored alternative up. |
| `align` | `target`, `flag`, `hold`, `tolerance`, `spotRadius` | Charges a perspective connection from a particular eye position. Optional `up` requires the correct gravity basis. |
| `shutter` | `target`, `flag` | Arms an unobserved arrangement change; optional `latch: true` makes it permanent. |
| `finish` | label | The shipped finale's departure-ledger interaction records campaign completion. |

All types accept `requires`. The shipped `finish` behavior is deliberately tied to this ten-chamber campaign; creating another campaign ending requires updating its campaign handler. The hub-construction loop and UI completion count likewise currently target ten chapters.

## Observation and perspective authoring

A shutter changes only after the player explicitly uses its stand, faces fully away from its target for more than 0.75 seconds, and remains more than 3 m from the frame. It evaluates only in the player's current room. The facing test is conservative; it is not a general scene-occlusion query. Place the stand where the visitor can comfortably see the target, turn away, and hear the latch. Preserve a return route from every arrangement.

An alignment trigger compares the player's eye position to `p`, forward direction to `target`, and optional required up. `tolerance` is a cosine; the shipped value `.992` gives a forgiving cone. Holding the view for `1.1` seconds sets the persistent connection flag. The UI displays charge progress. Once discovered, a perspective connection remains open so walking does not require maintaining pixel-perfect aim.

The viewpoint must have **corresponding geometry**. `art.kind: 'partialFrame'` supports `width`, `height`, `side: 'left' | 'right'`, `p`, and optional frame `normal`/`up`. If the observer is `M`, portal centre is `D`, and a partial frame is a fraction `t` of the depth toward the portal, author:

```js
partialCenter = M + t * (D - M)
partialWidth  = t * portal.width
partialHeight = t * portal.height
```

Use different depths for the left and right pieces. They then form one outline from the mark and separate when viewed from elsewhere. For a wall viewpoint, the frame's up basis must match the wall floor. Mark geometry projects the authored eye position toward the support plane; do not enter a floor point in the `align.p` field.

## Chapter text and completion

A chapter supplies `id`, `title`, `rule`, `objective`, `entry`, `completeFlag`, exactly three `hints`, and a concluding `reflection`. The hints should progress from explaining a relationship, to identifying useful architecture, to a concrete action sequence. All solution-critical dimensions and route choices must also be visible in the scene or notes; hints should clarify rather than supply an otherwise unknowable code.

The implemented finale has **one** half-size weight socket followed by an arrangement latch and a perspective latch. Its OPEN/HOLD/RELEASE names describe three spatial corrections, not three inventory pieces. Consult `WALKTHROUGH.md` and the actual source rather than the archived early design proposal.

## Validation and reproducible testing

Run from the project root with Node.js 20 or newer:

```text
node tools/validate-world.mjs
node tools/validate-world.mjs --json
node --test tests/authoring.test.mjs
node tests/replay.mjs --out evidence/campaign-replay.json
node --test tests/*.test.mjs
```

`validateWorld(candidate, { knownFlags: ['externally-supplied-flag'] })` is exported from `tools/validate-world.mjs` and returns `{ valid, errors, warnings, stats }` without mutating its input. Each issue has `code`, `path`, and `message`. The CLI validates the imported campaign world and exits with code 1 on errors.

Checks cover IDs and references, reciprocal endpoints, cardinal frame axes, matching aperture proportions, supported scales, finite positive dimensions, full-body safe spawns, solid bounds, weight/recall placement, interaction fields, hint counts, and condition syntax. An unknown flag warns by default because another campaign system may supply it; a partly exterior solid also warns so deliberate authoring is not rejected automatically.

Static validation cannot prove that a puzzle can be solved or looks correct. Extend the simulator's route using ordinary movement and ray-validated interactions, test recovery and reverse traversal, and inspect the actual browser rendering from both sides and unusual angles. The existing replay sets each chapter's initial entrance pose only for isolated chamber tests; its continuous campaign starts at the real hub spawn and does not reposition the player afterward. It programs the aiming direction and movement inputs, so it is simulation evidence rather than human playtesting.

## F3 spatial inspector

Press **F3** during play to open or close a read-only inspector. It releases pointer capture and displays:

- The current room's top view, collision solids, portal centres/normals, interaction locations, sightline marks, and player direction.
- Player room-local position, forward/up vectors, scale, and carried-object ID.
- Current-room connections with destination room, scale factor, source/destination up, open/closed state, and condition.
- Trigger targets, state flags, armed gaze state, alignment charge, and the complete flag dictionary.
- Recent-frame FPS and renderer view, draw-call, and triangle counts.

The map is a fixed X/Z projection viewed down ordinary Y; it does not rotate into a wall-gravity basis or represent height. Use textual pose, up, and trigger coordinates when inspecting gravity puzzles. It lists links for the current room rather than showing a global graph. The inspector has no teleport, solve, reset-state, or live editing controls, so inspecting a puzzle does not manufacture a completed solution.
