> **Public-sharing copy.** Machine-specific paths and host-injected identifiers are redacted where present; see [PUBLIC-SHARING.md](PUBLIC-SHARING.md).

# Asset provenance

## Runtime and procedural assets

- `vendor/three.module.js` is Three.js **0.170.0**, vendored from the published npm build at `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`. Its upstream MIT license is included in `vendor/THREE-LICENSE.txt`.
- Museum geometry, brass frames, sculptural exhibits, signs, contact-shadow texture, floor grain, and the daylight courtyard are built locally by `src/render.mjs` from the authored campaign. There are no remote models or texture requests during play.
- `src/audio.mjs` creates the original ambient score, event chords, and footsteps with Web Audio. No recorded or third-party audio is bundled.
- The interface uses system font fallbacks; no downloaded font is required. The conceptual print below is the only generated raster artwork.

## Curator's Study

- Project file: `assets/curators-study.png`
- Purpose: Iona Vale's conceptual architectural print, displayed as framed wall art in the museum. It does not represent playable geometry or a gameplay screenshot.
- Created on 2026-09-09 with the built-in `image_gen` tool, using the imagegen skill. One generation, no reference images, no CLI/API fallback, no post-generation edits.
- PNG dimensions: 1536 × 1024 pixels (landscape 3:2).
- File size: 3,568,065 bytes.
- SHA-256: `b4b0637380bc9177ec87d25b07c705b53dfbbfb9dab9827f9d2977bb2c6cf865`.
- Original output: `[LOCAL_IMAGEGEN_OUTPUT]`; copied into the project without removing the original.
- Visual inspection: full-bleed ivory limestone circular court, fine engraved architectural linework, interlocking stairs, gold details, turquoise sky, and no people, text, frame, logo, watermark, or UI. The result includes several sky-filled arches and a suspended gold circular ornament; it is accepted as the conceptual print from the single requested generation.

### Exact generation prompt

```text
Use case: stylized-concept.
Asset type: one original landscape museum print for framed wall art inside a 3D game; this is curator Iona Vale's conceptual architectural plan, not a gameplay screenshot.
Create a single landscape 3:2 image, requested size 1536x1024, pure painting full bleed, no frame and no text.
Subject: an impossible circular limestone museum courtyard with delicate interlocking staircases across three gravity planes and a solitary small open doorway revealing deep turquoise sky.
Style/medium: elegant archival architectural lithograph on antique ivory paper, precise fine engraved linework, midnight teal ink, restrained antique gold accents, subtle watercolor wash.
Composition and atmosphere: generous light and airy spaces, serene, curious, elegantly uncanny. The impossible architectural relationships should reward close inspection while remaining beautifully legible as an art print.
Constraints: no people, no text, no symbols, no logos, no UI, no watermarks, no border or frame. No horror imagery.
```
