# Human and street realism — October 7, 2026

This pass targets visible mismatches and repetition in the existing original game.

## Characters and weapon handling

- Human rifle poses now use grip points attached to the rifle transform. The support grip stays within the arm's reach. The original chest-relative fallback remains available for weapons without grip metadata.
- Armed actors replace the anatomical asset's open hands with small palms and curled finger/thumb segments. Unarmed characters retain the original hands. The held rifle now has a foregrip, pistol grip, magazine, and trigger guard.
- Upper shoulder vertices blend toward the chest to reduce gaps during arm rotation. Hidden torso skin is removed beneath clothing, trousers cover the waist, and the front seam is shorter.
- Shared, mipmapped cloth maps add restrained fold/weave normals and mottled wear. Facial vertex colors add subtle cheeks, lips, brows, and skin variation; the face material is less glossy.
- Human animation controllers apply short blinks on separate phases. Eye references stay outside serialized user data so ragdoll cloning does not duplicate face resource records.

The rifle remains a shared original procedural model; this is not a full collection of authored third-person weapon animations or photoreal character assets. Curled fingers are a fixed grip shape rather than an individually animated finger rig.

## Environment

- Removed the extra awning that overlapped the existing canopy. Selected low-rise storefront families have canopies; tall buildings no longer repeat the same shop shade treatment. Damaged canopies can have a missing strip.
- Ivy uses smaller rounded, folded leaves instead of sharp star outlines, with stems continuing toward the ground.
- Crossings have muted paint and chipped silhouettes. Some streets have parked abandoned sedans outside the central driving lane; their existing collision surfaces participate in static batching.

Street decoration remains static. This pass adds no new real-time light or reflection capture. Clothing textures are shared; static street geometry uses existing batching.

## Validation and limits

- Production build succeeded and all 70 automated tests passed. A new regression checks that both wrists reach weapon-local grip targets after the actor rotates.
- Hidden Electron motion checks rendered walking/running, preserved the death pose, and verified independent ragdoll bones without application errors. Close-up renders guided the shoulder, clothing-coverage, and grip corrections.
- The final world check covered street rendering, intact-building stability, glass/wall breakage, collapse, movable props, and destroyed-cell save restoration.

These checks use software rendering and do not establish hardware frame rates or exhaustive gameplay coverage. The art remains procedural and does not yet match the fidelity of the commercial reference games. This pass makes specific improvements to the current characters and streets without claiming overall quality parity.
