> **Public-sharing copy.** Machine-specific paths and host-injected identifiers are redacted where present; see [PUBLIC-SHARING.md](../PUBLIC-SHARING.md).

# Historical campaign proposal — not the implemented walkthrough

**Archived design material.** This document records an early proposal and includes routes and features that were changed during implementation. It is not an instruction manual, verified walkthrough, or description of the delivered campaign. Use `../WALKTHROUGH.md`, `../AUTHORING.md`, and the actual campaign source for current behavior. In particular, chapter 6 collects a plate, chapter 8 uses a simpler collection-to-conservation route, and the finale uses one half-size weight followed by HOLD and RELEASE conditions rather than three named portable pieces.

Design proposal for the implementation agent. Coordinate descriptions below are local to each room; the engine may place the room cells anywhere in its atlas. Every arch is an actual spatial connection, with a visible destination and a bidirectional transform. Numbers are suggested metres at visitor scale 1.

## Narrative and common grammar

Curator **Iona Vale** tried to conserve an impossible building by drawing a definitive plan. Each revision enclosed her in another room. Her last exhibition abandons the definitive map and teaches a visitor six reliable rules instead. The player reconstructs a route to the open air, then finds clear evidence that Iona has used it safely.

The hub is the **Court of Unfinished Plans**: warm ivory stone, desaturated petrol walls, dark bronze framing, late-afternoon light, a shallow reflecting basin, and an empty central door frame. No threat, chase, jump scare, or false death. Occasional low architectural sounds make the museum feel occupied. A handwritten name beside one of the plans is gradually replaced by a route.

Every chamber restores one **index plate**, automatically recorded on completion. The recurring portable object is a bronze-edged **index weight**. Its shape and dimensional markings make it clear that this is museum equipment, not an arbitrary key. Sockets show a ghost outline at the exact required size. A held weight remains visibly present; it is not silently transferred to inventory.

Room grammar: entrance = vertical white light; return arch = muted blue; objective = warm brass; observation mark = concentric ivory circles; gravity control = three-axis compass. Color is always duplicated by an icon, texture, and label. Doors never depend on color alone.

There is one clear immediate objective per chamber, with up to three persistent subgoals in the finale. The first hint describes the rule, the second describes the useful relationship, and the third gives an exact action sequence. A hint press shows the next hint and can revisit earlier hints. Merely waiting never reveals a hint without player request.

## Hub evolution

- Initial court: chambers 1–3 open; chapter labels advise doing them in order. The absent central door has a brass jamb and no opening.
- Three plates: court's formerly blank west wall becomes a real three-arch exhibition wing for chambers 4–6. It changes only while outside the hub or while the wall is fully unobserved; the change is announced by a distant latch and new light.
- Six plates: a balcony appears above the reflecting basin. A familiar portal reaches it, opening chambers 7–9. Earlier chambers remain available.
- Nine plates: the central frame gains a handle, leading into chamber 10, **Exit Without Exterior**. A compact hub plan records the six rules and the latest goal.
- Completion: the courtyard portal remains usable and the visitor may return to explore optional exhibits. A new-run control requires a clear confirmation; returning to the museum does not erase the completed game.

If implementing free order costs too much, gate chambers sequentially while keeping visited rooms available. The geometry still changes at plates 3, 6, and 9.

## Chamber 1 — The Gallery of Two Norths

**Rule:** position and direction belong to the two sides of a doorway, not to a global map.

**Geometry:** an entrance hall (12 × 14) contains a broad glass divider, leaving the index plinth visible but inaccessible behind it. An east-wall arch shows a long skylit gallery that could not fit beside the hall. Entering rotates the visitor 90° into that gallery. At its far end, a second arch opens directly into the enclosure behind the entrance hall's glass. The destination is visible through both arches, including from oblique angles. A painted floor ribbon enters the east arch and emerges north of the glass.

**Play:** follow the connected marble ribbon, retrieve the weight behind the glass, then bring it through both arches to the starting socket. Turning around inside the first arch reveals the hall at its surprising orientation. No switch replaces the traversal. The socket awards the plate and opens a short return arch.

**Hints:**
1. “A doorway promises a destination. It does not promise a direction.”
2. “The blue ribbon continues on the other side of both bronze frames.”
3. “Enter the east arch, cross the gallery's far arch, take the weight behind the glass, and return along the same route to the entrance plinth.”

**Optional exhibit:** a floor-plan frame whose four compass labels all read NORTH. Iona's caption: “The plan was accurate. Its paper was the problem.”

**Recovery / QA:** both arches stay open permanently; pickup and drop work on either side. Test stepping halfway through and backing out, forward/backward repeated crossings, and carrying the weight across at a 45° approach. The enclosure's glass cannot be jumped or bypassed.

## Chamber 2 — The Small Pavilion

**Rule:** a boundary's exterior does not determine its interior volume.

**Geometry:** a modest 3 × 3 freestanding pavilion sits in a 15 × 15 sculpture court. Its front door opens into the western end of a 26 × 18 archive. Its rear door opens into the archive's distant eastern end. A floor-to-ceiling glazed catalogue wall separates the two archive ends; it is plainly visible from both. Walking around the pavilion takes seconds; going around the catalogue wall from inside is impossible.

**Play:** the west archive contains a weight, the east archive contains its socket. Carry the weight out the front door, around the tiny pavilion, and through its rear door. The player deliberately uses the small exterior as a shortcut between distant interior ends. An unhurried panoramic route inside the west half establishes the scale before the shortcut. The entrance court overlooks the pavilion roof so its small exterior is unequivocal.

**Hints:**
1. “A building need not contain the shape of the space it encloses.”
2. “The two doors of this small pavilion are far apart in the archive.”
3. “Take the weight from the archive's west side, carry it outside, walk around the pavilion, and re-enter through the rear door to reach the east socket.”

**Optional exhibit:** one drawer contains successive pavilion blueprints, each exterior identical and each interior larger. Caption: “Storage exceeded the building in June. We retained the building.”

**Recovery / QA:** both front and rear doors are visibly traversable; neither closes. A weight dropped in the court remains accessible. Test a camera outside looking through the pavilion's front and rear doors and test front→rear→front travel.

## Chamber 3 — The Scale Cabinet

**Rule:** a scale passage changes visitor, movement, reach, and carried weight together.

**Geometry:** a 14 × 12 conservation studio shows a quarter-size doorway and socket beyond a low cabinet opening. A paired measuring arch shrinks its traveller to 1/4. Its reverse enlarges by 4. Beyond the arch, oversized handles, floor tiles, and a chair provide stable scale references. A 0.5-high cabinet aperture physically excludes a visitor at scale 1 but admits scale 1/4.

**Play:** take the unit weight before crossing the measuring arch. The carried weight shrinks to 1/4 and fits the tiny socket through the low aperture. An empty-handed return through the inverse arch restores normal scale. The weight is displayed in its tiny socket after completion.

**Hints:**
1. “The measure applies to everything that crosses with you.”
2. “The small socket needs a small weight. Take the weight through the measuring frame.”
3. “Pick up the unit weight, cross the quarter-scale arch, walk beneath the cabinet lip, and place the now-small weight into the matching socket.”

**Optional exhibit:** a miniature tea service next to an enormous full-size pencil, both labelled “life size.” Iona: “I stopped calling one size the real one.”

**Recovery / QA:** an incorrectly sized weight is rejected without being consumed; exact dimensional feedback explains why. Retreating reverses scale exactly. If the player enters without the weight, they can return. Collision and interaction reach scale with the body; camera near clipping must allow small-scale play. Save while small, carrying a small weight, and inside the cabinet.

## Chamber 4 — The Unseen Garden

**Rule:** attention pins an exhibit's arrangement; leaving it unobserved permits one defined change.

**Geometry:** a sheltered octagonal garden has a central mirrored sculpture and one bronze arch. In arrangement A the arch leads to a blue winter conservatory containing the weight. In arrangement B the same arch leads to an amber summer conservatory containing the socket. Both destinations are visible through the arch, and the floor, player-safe centre, entrance, and sculpture never move. Each annex has its own permanent return connection to the garden.

**Play:** inspect the sculpture and watch the arch's current season. Turn completely away from the sculpture while in the garden's audience ring; the arch changes once after a short beat. Turn back to inspect the new route. Retrieve the weight in winter, return to the ring, allow one unseen change, and carry it into summer. Changing the view alters an actual destination, not a sign.

**Hints:**
1. “An observed arrangement is a settled arrangement.”
2. “The sculpture fixes the doorway while you watch it. Give it a moment out of sight.”
3. “Find the winter route and take its weight. Return to the centre, look at the sculpture, turn fully away until the latch sounds, then turn back and take the summer route to the socket.”

**Optional exhibit:** garden maintenance log with the entry “Watered the plants that were present.” Iona: “I thought I was being watched. I was the one preventing change.”

**Recovery / QA:** arm a single change only after the sculpture has been observed, then require it to be unobserved for ~0.6 seconds; do not cycle every frame. Do not change while a player or carried weight overlaps the affected arch. Do not change merely because the player is in an annex. Annex return arches stay available under either state. Save includes arrangement and the gaze latch, or safely rearms the latch on load.

## Chamber 5 — The Sightline

**Rule:** a connection exists when separate frames coincide in perspective.

**Geometry:** two incomplete bronze frames stand at different depths over a shallow inaccessible basin. Their parts align into a whole rectangle when seen from an ivory observation mark on the near floor. Through that completed outline the visitor sees a remote ledge with the weight. The nearest frame is close enough to approach while staying on the alignment axis. A return frame on the far ledge provides the inverse connection.

**Play:** stand on the mark and look through the frames until the contour completes. Hold that view for one comfortable second to establish the connection; a filling bronze contour shows progress. The connection then remains stable, so the visitor can inspect and walk through the real open doorway without maintaining precise aim. Cross to the remote ledge, take the weight, and return through the reciprocal connection. Place the weight at the original plinth. A small diagram of a straight sight ray makes the condition readable.

**Hints:**
1. “Two incomplete things may share one complete outline.”
2. “The ivory rings mark the view from which the bronze fragments become one doorway.”
3. “Stand on the near observation mark and centre the two frame halves into a rectangle for one second. When the frame fills, walk through, retrieve the weight, and return to the entrance socket.”

**Optional exhibit:** a suspended anamorphic bronze knot becomes the word HERE from one side. Iona: “A perspective is useful. It need not be universal.”

**Recovery / QA:** the sightline must be attainable from a clearly marked safe floor region, with generous angular tolerance rather than a single exact pixel. A successful one-second charge latches the real portal until room reset and persists in saves. The connection remains reciprocal. Basin boundaries prevent falling and no far-side route depends on a now-unreachable mark. Describe the rule as “a viewpoint establishes a connection” so the latching behavior is internally consistent.

## Chamber 6 — The Gravity Atrium

**Rule:** down can change; the player's movement basis and falling objects follow it.

**Geometry:** a tall, clean rectangular atrium (14 × 12 × 12) has a walkable east wall fitted as another gallery floor. Its lamps, floor inlays, reachable ledges, and a mounted socket make the alternative orientation legible. A three-axis compass in a bevelled corner changes gravity between floor-down and east-wall-down. Landing surfaces are continuous and padded by broad chamfers; no lethal fall.

**Play:** take the weight, use the compass to change down toward the east wall, settle onto that wall, then walk along it to the socket several metres above the original floor. Looking back shows the entrance floor upright. A second compass accessible from the wall restores ordinary gravity for the return trip; completion can also expose a return arch whose rotation maps the wall's up direction into the hub's up direction.

**Hints:**
1. “The word floor describes an agreement.”
2. “The east wall is furnished like a gallery. The compass can make it one.”
3. “Pick up the weight, activate the corner compass, let the east wall become down, and walk along that wall to its brass socket.”

**Optional exhibit:** a chair fixed to the wall, a cup resting on its seat under that gravity. Iona: “An object is not falling wrongly. We have labelled the room prematurely.”

**Recovery / QA:** a genuine gravity vector drives falling and grounding. Walking axes come from local up; turning the camera alone is insufficient. Carried objects keep a consistent local offset; released objects fall toward the active floor. Limit selectable gravity orientations to two authored states. Camera roll eases gently but collision switches coherently; allow reduced motion with a brief fade/snap. Save on the wall, while carrying, and during the transition if permitted.

## Chamber 7 — The Hall of Measures

**Combination:** scale changes + incompatible connections + larger interior.

**Geometry:** a unit-size exhibit hall contains a half-scale measuring arch into a spacious annex. A separate **unmeasured** blue return arch leads back to the exhibit hall without changing scale. Thus the visitor can make a closed route through a shrink boundary and a neutral boundary. Two passes through the route produce scale 1/4. The final quarter-size aperture leads into a broad interior cabinet despite its tiny exterior. Its socket is marked with a four-part ruler and a quarter-unit outline.

**Play:** take the unit weight. Pass through the half-scale arch, return via the neutral arch, repeat, then enter the small cabinet with the quarter-size weight. The ordinary reverse route through the measuring arch is available to undo one step. The puzzle is about choosing the return connection, not simply walking through every arch once.

**Hints:**
1. “A journey may return to its starting place without returning its original measure.”
2. “The blue return arch preserves your size. Two halves make a quarter.”
3. “Carry the weight through the half-scale arch, return through the blue unmeasured arch, and do that once more. At quarter size, enter the cabinet and fill its quarter-size socket.”

**Optional exhibit:** a visitor's annotated route reads “same place, different person” beside a sequence of ruler marks. Iona's second plan visibly has no fixed scale.

**Recovery / QA:** clamp or reject authored transformations beyond supported scale [1/4, 4] with a visible explanation; never silently mis-map a boundary. Preserve reciprocal traversal. A fixed-size recall stand can restore the weight at unit size, and the entrance recovery control can normalize the visitor. Resetting an unsolved chamber never removes earned plates. A large visitor must not be allowed into a destination where the body cannot fit.

## Chamber 8 — Blind Transit

**Combination:** observation-dependent links + cumulative scale + rotated connections + carried objects.

**Geometry:** a compact central gallery has a three-sided bronze indexing screen and one active arch. State A connects through a **half-scale** boundary to an archive annex with a permanent **neutral** blue return. State B connects through a **double-scale** boundary into a socket enclosure behind a glass divider. The enclosure is plainly visible from the central hall; it has a unit-size socket. A unit weight begins beside the screen. The archive's neutral return reaches a stable central landing at a 90° angle to the screen. Ruler marks and a long inset floor ribbon communicate each route's ratio and rotated arrival.

**Play:** carry the unit weight through A to shrink it to one half; use the neutral blue return to preserve that size. Revisit the audience ring and unobserve the indexing screen to choose B. Carry the half-size weight through B, doubling it back to unit size inside the previously inaccessible socket enclosure. Deposit it. Taking B first produces a visibly oversized weight that the socket rejects; returning through B reverses that error. Scale creates the right carried state; observation makes the right connection available. A narrow optional display alcove offers a useful place to face away.

**Hints:**
1. “The useful route is sometimes the one that prepares you for another route.”
2. “The socket wants one whole measure. Its route doubles what enters, so arrive at that route with one half.”
3. “Carry the weight through the half-scale archive route and return through the blue neutral arch. From the audience ring, watch the screen and turn away once to select the double-scale socket route. Carry the half-size weight through; it arrives at unit size and fits.”

**Optional exhibit:** Iona's crossed-out word TRAPPED, replaced by “Connected to the wrong side.” The final note here states plainly that she is alive and trying to reach the open air.

**Recovery / QA:** reconfiguration triggers only within the marked ring, so players can inspect side exhibits and move through portals freely. Screen visibility can be obstructed by architecture; use actual occlusion or make the screen's line of sight unambiguous. Never reroute the blue annex return. Both state-specific scale transforms are reciprocal. Test B-first, repeated A loops, recalling a weight while small, and leaving the socket enclosure with the wrong size. If the entering arch changes when viewed through another portal, the renderer and traversal must use the same evaluated state and scale.

## Chamber 9 — The Ceiling Observatory

**Combination:** gravity + perspective connection + orientation-transforming portal.

**Geometry:** a tall observatory has an ivory observation mark on its east wall, several metres above the ordinary floor. Two incomplete frames only form a rectangle from that wall position. The compass changes down toward the east wall, letting the player reach and stand on the mark. The resulting portal leads to a small peaceful record room with ordinary floor-down gravity; its transform rotates wall-up into floor-up.

**Play:** take the weight, make the east wall the floor, walk to the wall observation mark, and hold the aligned frames in view for one second to establish their connection. Cross the resulting doorway. The world rolls coherently as the destination's ordinary floor replaces the observatory wall underfoot. Place the weight in the record room's socket and read the last curator note. The return portal is bidirectional with the inverse rotation, and a separate earned return arch leads to the hub.

**Hints:**
1. “Some viewpoints must be reached before they can be understood.”
2. “The ivory mark is on the wall. Let that wall become the floor, then align the frames from it.”
3. “Carry the weight, use the compass, walk along the east wall to the observation rings, and centre the incomplete frames for one second. Walk through the completed doorway and fill the socket in the record room.”

**Optional exhibit:** the only unframed window in the museum shows ordinary sky. Iona: “I can see the outside. I need a route that admits it.” The record room clearly explains the finale's three conditions in words and a pictorial diagram.

**Recovery / QA:** test with player scale 1 and restored normal scale from earlier chapters. The portal transforms body, camera forward, up, velocity, carried weight, and active gravity consistently; its inverse exactly reverses this. The horizon must not jump twice from both a portal transform and gravity reset. Saving on the wall and then traversing after reload is required.

## Chamber 10 — Exit Without Exterior

**Combination:** all six rules in a legible, checkpointed final route.

**Geometry:** inside the hub's newly completed central frame stands a small pavilion. Its expansive interior is the **Unfinished Plan**: a three-part installation labelled **OPEN**, **HOLD**, and **RELEASE**. A visible ghost of the final exit occupies the far wall. Three brass lines from the installations visibly converge on it. Each socket has a name and a dimensioned ghost outline. A permanent safe return connection leads to the hub throughout. Earlier completed exhibitions supply the proofs that unlock this final room; they do not demand replay.

**Play / persistent subgoals:**

1. **OPEN — half measure:** carry the unit OPEN weight through a half-scale arch, then use a rotated neutral return to retain that size. Enter a low threshold in the pavilion's oversized interior and fit OPEN into its visibly half-size socket. This creates the first section of the future exit's frame. The return measuring arch can restore the visitor after the piece has been placed.
2. **HOLD — whole measure:** the central indexing screen pins an arch to the wrong side of a visible glass divider. From the audience ring, inspect it, turn away once, and return your view. Carry the unchanged HOLD piece through the changed route to its unit-size socket. This creates the second section of the frame. Socketing latches the arrangement, so later movement cannot undo it.
3. **RELEASE — double measure:** carry the unit RELEASE piece through the enlarging side of the measuring arch, then take a neutral return to retain double size. Use the reachable compass to make the east wall down. Its observation mark now stands on a walkable floor; align the incomplete frames for one second to create a real portal to the double-size RELEASE socket. Carry the piece through and place it. The final exit doorway is now a real reciprocal spatial connection, visibly opening onto an outdoor garden.

Each accomplished plate remains lit and persists through save/recovery. The diagram from chamber 9 and the finale entrance repeat the exact relationships: **“OPEN: one half. HOLD: one whole. RELEASE: twice the measure.”** A second pictorial line connects these to the small threshold, changed gallery, and wall viewpoint. There is no secret sequence, timed task, random state, or trial-and-error combination. The precise requested sizes can be adjusted to the engine's supported authored scales; show them unambiguously on the socket and piece markings.

**Hints:**
1. “The names belong to the pieces; the outlined dimensions belong to the spaces they must fit. Every route uses a rule you already know.”
2. “OPEN needs the shrinking route, HOLD needs a changed arrangement, and RELEASE needs an enlarged measure and the viewpoint on the other floor.”
3. “Shrink OPEN once and preserve its size through the neutral return before using the low threshold. Leave HOLD unchanged and turn away from the indexing screen to reach its socket. Enlarge RELEASE once, preserve its size through the neutral return, change gravity, and align the wall frames for one second to reach its socket. Then walk through the completed exit.”

**Resolution:** the destination is a calm open courtyard in morning light. A packed suitcase, an open museum ledger, two warm cups, and a simple note resolve the curator's disappearance: **“I am safely outside. The door held. I have left the gate open for you. — Iona Vale.”** The ledger contains both the curator's departure and the player's entry as **“Visitor, and co-author of the way out.”** A final interaction writes the player's departure line. A chair invites a quiet pause; no new puzzle interrupts the ending. The door remains open in both directions for optional exploration.

**Recovery / QA:** each socket has an independent persistent flag and locks the correctly named, correctly sized piece. Wrong pieces/sizes remain in hand and receive explicit feedback. HOLD's route does not revert after it latches. The exit is completed only when all three socket predicates are true, and the ending requires walking through it. Reload before and after each subgoal. Returning to the hub midway and resuming must preserve all progress. An already-completed save starts at a safe courtyard or hub anchor and never re-locks the exit.

## Authoring fields useful for all chambers

Each chamber should expose: `id`, `title`, `rule`, `intro`, `roomCells`, `portals`, `objects`, `sockets`, `triggers`, `objective`, `hints[3]`, `optionalExhibits`, `returnAnchor`, `recoveryAnchor`, and `completionFlag`. Portal data includes a source frame, destination frame, transform scale, rotation, enabled condition, and reciprocal partner. Chambers 4/8 add a two-state routing switch and safe activation region. Chambers 5/9 add a sightline mark, alignment target, tolerance, one-second charge, and saved latched connection flag. Chapters 6/9 add two gravity bases with safe landing bounds. Chapter 10 uses three monotonic socket flags.

Developer view should show room cell bounds, portal source/destination IDs and direction arrows, frame normals, transform scale, local gravity/up, gaze targets and audience rings, safe recovery anchors, objective state, carried-object scale, and the last portal crossing. It should offer room teleport, solve/reset current chamber, recall weight, and toggle render diagnostics. Developer solve actions must be labelled as such and excluded from claims of verified walkthroughs.

## Safety and verification checklist

- Portal transforms are geometric, reciprocal, and shared by rendering, collision, interactions, and persistence.
- Every authored portal is tested in both directions at centre and near its edges, while moving backward, and while carrying an object.
- A traveller crossing a boundary cannot be bounced back by a stale cooldown or moved twice in one frame. Use side tests and a small geometric hysteresis zone.
- An interaction ray may cross a boundary only using the same portal transform and bounded traversal as rendering. A visible object through an open arch can be picked up only if the transformed path length is within scaled reach and the carrying path is safe. A visible object beyond range receives no misleading interaction prompt.
- Dropped objects cannot vanish into disconnected room coordinates, below a floor, through an inactive frame, or behind a newly solid wall. A recall control is always available and restores only an unsocketed weight.
- Gaze changes wait while occupied boundaries are clearing; perspective connections remain latched once charged. Reconfiguration never alters a player's support floor or removes the only return route.
- Every authored scale is supported by collision radius/height, step size, speed, interaction range, carried offset, gravity movement, and near clipping. Reject out-of-range scale changes visibly and reversibly.
- Save world cell ID, local pose, up/gravity basis, player scale, object cell/pose/scale or carry state, portal/gaze states, chapter flags, optional exhibit reads, and hint level. Validate saved poses against geometry; recover safely on a corrupt or outdated save with a visible explanation.
- Recovery returns the visitor to a known clear anchor, recalls an unsocketed weight, and preserves earned plates and finale subgoals. Reset-current-chamber and new-game must be distinct.
- Walkthrough evidence must use ordinary controls and actual puzzle predicates for every chapter. Automated pose injection is appropriate for unit geometry tests, not proof of a played solution.
- Deliberate visual limits should be disclosed: bounded portal recursion, no nested recursive shadows, authored gravity axes, authored supported scales, and a small occupied-boundary grace period. These limits should be concealed during normal framing by architecture and stable fallback vistas, not by black portal rectangles.
