# Unity visual stability pass

This pass addresses the flashing threshold, lighting changes at portals, and unstable ceiling shadows reported in the first Windows preview. It retains the existing placeholder art.

## Changes

- **Threshold flicker:** the old threshold top was exactly coplanar with the room floor. The importer now raises it by 6 mm at ordinary doorway scale, scaling the reveal with the aperture. Sideways-gravity thresholds use the same local rule. Reimporting preserves this correction.
- **Close-range portal rendering:** the player camera keeps its normal scale-adjusted near distance. The portal surface uses hardware depth clamping for the player view, with expanded CPU culling bounds. Nested views retain their exit-plane clipping. This avoids extremely small near distances and prevents diagonal apertures from disappearing when some vertices pass behind the camera. Unity documents the distinction between [depth clipping and depth clamping](https://docs.unity3d.com/6000.0/Documentation/Manual/SL-ZClip.html).
- **Shading continuity:** the screen-space AO feature is removed from the PC renderer's feature list, consistently for both player and portal cameras. The installed AO depth reconstruction assumes a conventional projection; it does not correctly describe these oblique portal views. Removing the feature reference also avoids this Unity version trying to initialize a disabled AO feature whose resources were stripped from the player build. Baked material/room occlusion or a projection-aware replacement remains future work.
- **Room lighting:** local lights are enabled only for the room being captured, and the current room is restored after nested captures. Directional courtyard daylight is restricted to authored open-sky rooms. This prevents hidden neighboring rooms and unrelated daylight from affecting an indoor view.
- **Ceiling shadows:** downward spotlights provide the direct shadowed illumination, with weak unshadowed fill for ceilings and housings. This removes the point-light shadow face transitions and pronounced housing self-shadow rings. Object shadows remain real-time.
- **Edge quality:** the PC pipeline and portal targets use up to 4× multisample antialiasing, with supported sample counts queried on the GPU. The first portal view uses full player resolution up to the existing width cap; nested views retain their lower-resolution budget.
- **Wall seams:** a small overlap seals the generated wall partitions, avoiding bright pinholes along exact butt joints under multisample coverage and shadow filtering. The overlap stays behind the doorway trim.

## Verification

The Play Mode suite checks the threshold reveal, room-light state restoration, stable near clipping, existing carrying/gravity behavior, and the full first-exhibition route. Rendered checks cover both directions through the ordinary gallery doorway, quarter-scale doorway, and wall-gravity doorway, with straight and diagonal views immediately before and after crossing. Measurements compare a central crop to avoid conflating moving screen-edge silhouettes with room-wide flicker.

The standalone visual audit runs the same captures in the built Windows player. This is more meaningful than checking shader compilation alone: an earlier iteration passed straight-ahead captures but failed diagonal views and was corrected before packaging.

Final verification: **42/42 Editor tests, 8/8 Play Mode tests, and 96/96 standalone image poses passed**, with no errors in the standalone log. The archive contains the executable and its dependencies and excludes build backups and diagnostic captures. See [the machine-readable verification record](../evidence/unity-visual-fixes-verification.json) and [the final doorway capture](../evidence/unity-visual-fixes-doorway.png).

The measurements are regression probes, not a claim that every pixel stays identical. Perspective, visible geometry and shadow filtering change slightly during motion. The dark recursion cutoff, unfinished materials, and unimplemented full-campaign presentation remain separate limitations. Broader hardware and frame-time profiling remain outstanding.

The corrected player is the Windows download attached to [v1.1.0-unity-preview.1](https://github.com/Spixyeyeses/museum-of-impossible-rooms/releases/tag/v1.1.0-unity-preview.1). The verification record describes the tested artifact; publishing renames the ZIP without changing its bytes.
