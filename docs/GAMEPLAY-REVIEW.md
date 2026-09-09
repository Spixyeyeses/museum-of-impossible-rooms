> **Public-sharing copy.** Machine-specific paths and host-injected identifiers are redacted where present; see [PUBLIC-SHARING.md](PUBLIC-SHARING.md).

# Gameplay and visual authoring review

Review of the **implemented** `src/campaign.mjs`, `src/render.mjs`, and the relevant simulation interfaces on 2026-09-09. This record began as a source review with targeted mathematical and renderer-state checks. The final independent review below adds inspection of the completed evidence and selected actual WebGL images. It does not claim a human playtest.

## Implemented campaign, distinct from the earlier design draft

The archived `design/CAMPAIGN-PROPOSAL.md` is an early proposal, not the shipped specification. The implementation uses sequential exhibition unlocks, one index objective per chamber, persistent earned plates, and repeatable recovery. Access through the hub evolves as plates are earned; the hub's physical footprint stays fixed and the final north-wall entrance appears after the ninth index.

| Chamber | Implemented objective and necessary spatial relationship |
|---|---|
| 1 — The Gallery of Two Norths | Cross a rotated arch into the long gallery, use its other arch to reach behind the entrance room's continuous glass, and carry the 0.8 m weight back to the entrance socket. |
| 2 — The Small Pavilion | The tiny exterior's front and rear doors reach the two sides of a much larger archive. Carry the 0.8 m weight outside and around the pavilion to reach the other side of the archive's glass wall. |
| 3 — The Scale Cabinet | Carry the weight through a quarter-scale portal, pass physically beneath the low cabinet lip, and fit the resulting 0.2 m weight. The inverse portal restores size. |
| 4 — The Unseen Garden | Retrieve the winter weight, return, explicitly release the arrangement at the stand, and turn fully away for 0.75 seconds to switch the same arch to summer. Fill its 0.8 m socket. |
| 5 — The Sightline | Stand on the marked viewpoint and look through a matching partial-frame construction for 1.1 seconds. The actual portal remains open after this discovery. Retrieve its weight and fill the original socket. |
| 6 — The Gravity Atrium | Change gravity toward the east wall, walk on that wall to the formerly elevated north arch, and collect a memory plate in its destination. This chamber uses a plate interaction, not a carried weight/socket puzzle. |
| 7 — The Hall of Measures | Carry the weight twice through the half-scale portal, taking the neutral return each time. At quarter scale, enter the tiny collection portal and fit its 0.2 m socket. |
| 8 — Blind Transit | Retrieve the full weight from COLLECTION, return, release the arrangement and look away, then enter CONSERVATION through the same frame at half scale. Fill its 0.4 m socket. This is the intentionally simpler implemented combination; it is not the half-then-double proposal in the draft. |
| 9 — The Ceiling Observatory | Carry the weight, change gravity to reach the wall viewpoint, charge its perspective connection, cross the orientation-transforming arch, and fill the record-room socket. |
| 10 — Exit Without Exterior | OPEN: take the pavilion's weight through its half-scale interior passage and fill a 0.4 m socket. Restore visitor size through the 2:1 return. HOLD: release and unobserve the main arrangement. RELEASE: enter the other-floor gallery, change gravity, reach its wall mark, and charge the exit connection. Physically cross into the courtyard and sign the departure ledger. These are three thematic persistent conditions, not three named portable pieces. |

Optional text exhibits and three graduated hints are authored for the chambers. The final note states that Iona is safely outside; signing the ledger provides the narrative ending while leaving the return doorway available.

## Concrete findings and fixes

### Fixed during this review: inactive overlapping portals covered the live connection

Garden and transit author two portal endpoints in the same source frame, with opposite conditions and `hideInactive: true`. The renderer previously ignored `hideInactive` and drew both surfaces and labels, allowing an inactive dark surface to cover the correct live view.

`renderView` now hides the complete inactive group, evaluates both the source and destination requirements like the simulation, and restores group visibility along with material/surface state after each recursive render. A targeted state check exercised both winter/summer arrangements and confirmed the inactive group was hidden during rendering and original visibility restored afterward.

### Fixed during this review: wall viewpoint markers were placed on the original floor

The old marker path always put its ring at global `y = 0.025` and ignored the authored up vector. The gravity-dependent marks in chambers 9 and 10 therefore appeared somewhere the player did not need to stand.

Markers now project the authored eye position by `-up × 1.575`, orient the circle and label to that support plane, and put the wall marks at `x = 5.975`. The corresponding wall-mounted gravity controls are oriented to the same up basis. The final independent review inspected the later wall-floor image and its coherent orientation.

### Fixed during this review: perspective artwork could not form the stated outline

Chamber 5 originally used two complete squares with unrelated perspective dimensions in front of a rectangular portal. Looking from its mark could not make the claimed single outline.

The renderer now supports left/right partial rectangular frames. The c5 near/far widths, heights, and centres are exact projections of the 2.6 × 3.6 portal from `[0, 1.6, 5]`, at depths 7 and 11 out of 15. The wall constructions in c9 and c10 use the same proportional construction in their authored wall-up basis. A mathematical check confirmed the centres and dimensions lie on the correct sight rays for all three constructions. The alignment mechanic remains the deliberate 1.1-second charge and then latches; it does not require maintaining precise aim while walking.

### Fixed during concurrent engine work: socketed weights could fall or be reused

At initial review, socketed weights still entered object gravity and could be picked up again. Because display plinth geometry is decorative, weights could fall through their completed plinths. Reusing an earlier same-size weight could bypass a later retrieval objective.

The current engine excludes socketed weights from physics, interaction tracing, and pickup. This closes the observed exploit and keeps completed displays stable. Relevant simulation tests should remain part of the final verification run.

### Improved during this review: the ending was rendered as another roofed chamber

The courtyard now has `openSky: true`, omits its ceiling/coffers, and uses daylight, distant clouds, planting beds, a tea table set for two, and seats. The final interaction is modelled as an open departure ledger rather than an abstract floating polyhedron. This gives the authored narrative resolution corresponding visible objects.

The courtyard furnishings now have authored collision boxes: the planting beds are centred at `x = ±9`, span `z = -7.5..1.5`, are 2 m wide, and rise 0.46 m; the tea table is centred at `[-4, 0, 2]`, with a 1.2 × 1.05 m footprint and 0.82 m top; chairs are centred at `x = -5.15/-2.85, z = 2`. The final verification report records subsequent rendered inspection.

### Fixed during concurrent engine/renderer work: held-object rendering must share the simulation pose

At this review's first handoff, the renderer reconstructed a carried object's position in the player's current room with a cosmetic right-hand offset. The engine could already have placed that object in the destination room as it extended through a portal, possibly at a changed scale. Rendering could therefore disagree with interaction/collision during an ordinary boundary approach.

The engine now includes the lateral hand offset in its physical placement calculation, and the renderer uses authoritative object room, position, and size, with clipped counterparts at crossed boundaries. Final verification should include approach, retreat, carrying across, and interaction through both shrinking and orientation-changing boundaries after this shared-pose change.

## Recovery and usability observations

- The gaze switch requires an explicit stand interaction, then an unobserved interval while still in the source room and more than 3 m from the affected frame. Entering an annex stops source-room gaze updates, avoiding the obvious “route changed behind me” trap. Test arming, approaching, backing away, and returning with a carried weight.
- The quarter-size sockets and cabinet aperture agree with the scale route. The low opening is collision geometry, not explanatory text. The hall-of-measures neutral route is necessary to preserve accumulated shrinking.
- Wrong-size socket interactions retain the weight and give both actual and requested measurements. This is good recovery feedback.
- OPEN, HOLD, RELEASE persist separately, and the finale contains a real exit portal followed by the ledger interaction. Returning to the hub midway should not require repeating completed conditions.
- Gravity stations have one fixed alternative axis and a reciprocal restore action. The wall doorway's frame basis maps wall-up to ordinary destination up. Save-and-return tests must cover those authored positions rather than only a synthetic portal.
- Earlier unsolved-state flags can survive recovery. In garden/transit this is safe only because the release stand can toggle the route back; a replay should specifically recover while the weight is in the now-inactive collection and confirm it can be retrieved.
- Nine exhibition frames are initially present in the hub, with sequential conditions controlling access; the finale appears on the north wall after index nine. Describe this as progressive access, illumination, and the revealed final doorway; the growing wings/balcony from the proposal were not implemented.
- Decorative sculptures remain visual exhibits, while navigation obstacles and the added note/plinth/courtyard furniture collision boxes are authored solids. Do not imply that every individual visual detail has its own physical simulation.

## Initial checks actually performed

1. `node --check src/render.mjs` — passed.
2. `node --check src/campaign.mjs` — passed.
3. Targeted module-level projection check for c5, c9, and c10-HOLD partial-frame centres and dimensions — passed.
4. Targeted wall-mark projection check (`x = 5.975`) — passed.
5. Renderer-state check for both c4 arrangements, including inactive group hiding and recursive state restoration — passed.
6. Confirmed courtyard is authored `openSky: true` — passed.

Those initial checks were source/math/state checks only. The later evidence inspection is recorded separately below.

## Final independent gameplay and documentation review

The final read-only review compared `WALKTHROUGH.md`, `AUTHORING.md`, the campaign, the UI handlers, and the current recorded results. **No blocking route, hint, or completion contradiction was found.** In particular:

- All ten described puzzle goals match their actual flags and interactions. Chamber 6 is explicitly described as a plate collection; chamber 8 uses the implemented collection-to-half-conservation route; the finale uses one socket and then HOLD/RELEASE conditions.
- The chapter 7 return instructions correctly use the inverse neutral/measuring loop twice. Other documented return routes restore normal visitor size and up before the hub, matching the continuous solver assertions.
- Recovery advice distinguishes recalling a loose weight from normalizing the visitor and explains how to toggle winter/collection back after recall. Completed indexes and settled finale corrections are retained.
- The walkthrough explicitly distinguishes isolated chapter setup, continuous simulated traversal, browser controls, optional note recommendations, and human playtesting. It does not call scripted aiming a human keyboard/mouse playthrough.
- `evidence/unit-final.txt` records **88 tests passed, zero failed**. This reviewer inspected that recorded result rather than claiming another full test run.
- `evidence/campaign-replay.json` records all ten chamber predicates and the continuous **58-crossing** route passing, with **538.97 simulated seconds**. These are solver timings, not an estimated visitor play duration.
- `evidence/rendered-replay.json` records a passing browser/WebGL input replay ending in the courtyard with all ten indices and `finished: true`; it reports 161 samples, no replay failures, and no source changes during that run. Its method explicitly says rendering was sampled and aiming was programmed. This is stronger evidence than isolated screenshots but remains distinct from a human playtest.

This reviewer also opened the actual image files for the one-millimetre and ten-micron portal approaches, an oblique portal view, perspective before/after, the wall floor, and the courtyard. The latest individual images show continuous destination views, a working change from closed frame to visible destination, coherent wall orientation, and an open-sky ending with the ledger and tea setting. `visual-probes.json` identifies these as diagnostic poses, not a played walkthrough. Its room/pose metadata is authoritative; the probe HUD can lag a directly assigned diagnostic pose.

Two non-blocking presentation/inspection notes were sent to the main implementer and subsequently resolved:

1. The older `visual-review-contact.png` composite contained a superseded blank portal panel. The implementer rebuilt it from the final 20 passing probe images, including exact-plane and wall-boundary cases, and visually inspected the replacement.
2. The reviewed UI key handler accepted E/Q/R while F3 was open. The implementer added the missing inspector input guard. The definitive browser suite passed 17/17 checks, including an assertion that E/Q/R/H/J leave the complete serialized state unchanged while F3 is open.

This final review did not add or change gameplay, rerun the complete browser suite, subjectively listen to audio, or inspect installation on another computer. The final verification report remains the place for complete environment, performance, installation, and deliberate visual-limit disclosures.
