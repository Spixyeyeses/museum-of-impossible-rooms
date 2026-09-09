> **Public-sharing copy.** Machine-specific paths and host-injected identifiers are redacted where present; see [PUBLIC-SHARING.md](PUBLIC-SHARING.md).

# Spatial simulation status

Implemented in `src/engine.mjs`; deterministic Node tests in `tests/engine.test.mjs`.

## Completed

- Continuous plane crossings use reciprocal aperture coordinate frames, including position, forward, up, velocity, player scale and held cube scale. One portal pair can connect unrelated room coordinates and dimensions.
- Room bounds have genuine aperture openings. Conditional solids, cube obstacles, frame-edge clearance, sliding, floor contact, and destination body clearance are enforced.
- Rendered furniture has matching collision records: socket plinths, note stands, shutters, both orientations of gravity consoles, the memory pedestal, departure ledger and courtyard furniture. These records are invisible to rendering to avoid duplicate meshes. Observation marks remain clear floor paint. Collected memory exhibits remove both their interaction target and their conditional collider.
- Cardinal gravity changes rotate the camera/body and produce falling toward the appropriate floor or wall. Portals transform that orientation into the destination frame.
- A held cube can visibly lead the player through an aperture into the destination room; it is transformed according to the hand ray's route. The authoritative hand pose sits .37 scale units right and .32 down from its forward reach. That complete offset participates in the portal ray. Whole-cube clearance handles oblique walls/floors, and the hand tucks inward at tight aperture edges. Pickup can reach through a portal and compares apparent size. Drops keep their current transformed size and require a collision-free location outside the player's body.
- Interaction rays traverse up to four apertures, transform remaining reach by the scale ratio, and respect occlusion by walls, solids and cubes.
- Saves validate vectors, cardinal up, scale, world membership, collisions and untrusted flags. Recovery restores the checkpoint spawn and unsocketed cube homes while preserving progression.
- Simulation substeps at no more than 1/90 second and caps any single frame to .1 seconds to bound work after a pause.

## Verification

`node --test tests/engine.test.mjs` passed 23 core tests on Windows using the bundled Node runtime. This includes 100 reciprocal transform pairs, actual forward/backward movement, quarter-scale carrying and expansion, sideways gravity traversal, portal ray range and occlusion, pickup/drop, a cyclic ray route, transformed saves, malformed saves and safe recovery. Additional hand-pose tests check its exact offset, crossing before the body without double scaling, tight aperture/oblique surface clearance, gravity agreement on re-entry, and absence of invisible interaction targets after collection.

`tests/campaign.test.mjs` adds 25 integrated checks: all ten authored chambers; one continuous full campaign; reciprocal authoring consistency; socketed cubes; reversal of the two half-measure loops; repeated loops down to the scale safety boundary and subsequent recovery; watched versus unobserved arrangements; the wall viewpoint; hints, notes and visits; recalled weights; furniture collision coverage; physical movement stopping at and walking around a plinth; loose weights in inactive winter/collection annexes; recovery at all three partial finale phases; and correcting a refused weight's measure through the ordinary route. The complete suite contains 48 tests.

The final full project run passed **92/92 tests**, including all **48 engine/campaign tests**, 35 authoring tests, and nine server/package tests. The four added recovery/size regressions first passed in isolation and then passed again in that integrated run. They physically drop and leave a weight behind before switching away from its annex, recover and reopen that annex, and pick it up again. The finale regression recovers after OPEN, inside HOLD with wall gravity, and after RELEASE; it preserves the filled index and physically completes the remaining route to the ledger. The size regression submits a half weight to the quarter socket, retains it, completes another half-measure loop, and successfully fills the same socket. Exact final output is in `evidence/unit-final.txt`.

`node tests/replay.mjs --out evidence/campaign-replay.json` reproduces every chamber and the full journey, using normal `step` movement, gravity and `trace`-validated interactions. Separate chamber simulations begin at their safe entrance. The additional full-campaign simulation starts at the actual museum spawn, unlocks the hub in order, physically returns from annexes, restores scale and gravity by their routes, and reaches the departure ledger. It completes 58 portal crossings and all ten indices in 538.97 simulated seconds. It does not reposition the player after the initial spawn. Checkpoint save/restore round trips are exercised during the journey. The route includes ordinary sidesteps around shutter stands, completed indices, wall compasses and the central court display on the approach to its final north doorway.

Observed implementation failures fixed during testing: floor-contact tolerance magnified by a scale-expanding return aperture; inactive arrangement siblings blocking a co-located active portal; socketed cubes falling from their stands or remaining pickable; and restoration discarding numeric chapter identifiers, hint counts, visits and socket identity. Continuous campaign and regression tests cover each correction. The automated route also explicitly walks around the filled OPEN index, because the completed cube correctly remains a collision obstacle.

## Deliberate bounds and integration notes

- Player collision uses a box oriented along cardinal up (1.6 scale units below the eye, .2 above, .24 horizontal radius). It is not a rounded capsule.
- Portal fronts are traversable; their backs are solid. The reciprocal destination aperture supplies return travel. Do not author a walk route that depends on entering the back of the same freestanding frame.
- Four portal crossings bound one interaction ray. Movement allows up to eight within one integration operation. Scale changes outside `world.minScale ?? .0625` to `world.maxScale ?? 4` are rejected with a `scaleBlocked` event, without clamping the transform.
- `setGravity` stores `flags['gravity:'+roomId]` for loose-object gravity. A portal preserves its transformed player up and establishes that same up as the destination room's current gravity. Re-entering through an ordinary doorway consequently restores the ordinary local floor; returning through the wall-oriented doorway retains the other floor. This keeps the visitor and loose objects under one gravity without snapping camera orientation away from the aperture transform.
- Pickup size limit is `world.pickupMaxSize ?? 1.3` times player scale, after accounting for intervening portals. Oversized pickups produce `tooLarge`.
- Recovery preserves objects with `object.socketed === true` or `flags['socketed:'+id]`; other cubes return home. Campaign socket handling should set one of those markers.
- Rendering and actual browser presentation are owned by the integrating task; these simulation tests make no claim of rendered visual verification.

Additional exports: `EYE_HEIGHT`, `PLAYER_RADIUS`, `MAX_RAY_PORTALS`, `add`, `sub`, `mul`, `dot`, `cross`, `length`, `normalize`, `getRoom`, `canPlaceObject`, `resetObject`. Required contract exports remain available.
