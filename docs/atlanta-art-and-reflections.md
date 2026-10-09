# Atlanta district, physical scale and live reflections

This is a visual foundation pass toward the requested look. It is still a procedural prototype, not AAA or photorealistic production art.

## Reference direction

The reference study used Fallout: New Vegas storefronts and weathered commercial signage, STALKER 2’s overgrown urban material treatment, BODYCAM’s grounded camera/material presentation, and Atlanta’s historic brick commercial streets. Game screenshots were inspected as references; none were used as shipped assets. The setting and storefront names are original, rather than copies of game or television locations.

- Fallout reference gallery: https://www.newgamenetwork.com/media/3884/pc/fallout-new-vegas-screenshots/
- STALKER 2 reference: https://news.xbox.com/en-us/2024/11/20/stalker-2-launch-day/
- BODYCAM reference gallery: https://www.gamestar.de/galerien/bodycam%2C136673.html
- Atlanta streetscape reference: https://www.atlantahistorycenter.com/blog/atlanta-in-the-negro-motorist-green-book/

## What changed

- The opening district uses six by six 44-metre blocks, 12-metre roads, one-to-three-storey brick storefronts, service courts, curbs and small fire hydrants. The layout is inspired by Atlanta neighborhood architecture rather than reproducing Atlanta’s street map.
- Building widths/depths now support believable floor heights and human scale. Doors are 0.95 by 2.15 metres. Nyra’s model measures approximately 1.81 metres tall. Enemy spawns move out of occupied building footprints.
- The urban platform stays level while distant terrain retains hills, so roads, foundations, curbs and placed objects share a support surface.
- Supplies and loot containers are seated using transformed bounds. Pickups no longer bob or rotate; artifact cores remain grounded while their light pulses. Field records stand on physical posts. NPC names use the interaction HUD instead of floating nameplates.
- Original generated brick, asphalt and weathered-window textures ship with the project. They are shared, mipmapped and sampled with limited anisotropy. Storefront signs share six cached material variants.
- Generic abandoned sedans have a shaped roof, side glass, rims, lights and bumpers. Enemy bodies use rounded/tapered geometry and revised proportions. Nyra uses the clothed character builder. First-person weapon and palm geometry has rounded edges.
- Grading uses a linear mid-gray contrast pivot, avoiding crushed shaded surfaces. Grain is reduced; medium quality permits FXAA. Clouds darken with the day/night cycle.

## Live reflections

A small irregular puddle in the starting street uses a real mirrored scene render, with viewing-angle-dependent reflectivity and faded edges. Selected window, glass, vehicle-metal and weapon-metal materials receive a cubemap captured from the actual game scene, then prefiltered for roughness. Chrome/paint batching preserves the original roughness and metalness instead of flattening every material into one matte bucket.

The puddle is updated when visible. The cubemap is cached and refreshed approximately every four seconds on medium quality, with an immediate refresh for large time-of-day changes. Paused/menu scenes keep the cached probe. The probe is a local approximation; it is not ray tracing or an exact independent reflection for every window. The window albedo contains authored surface detail, with live reflection layered through its material.

Medium quality uses a 128-pixel cubemap and a 384-pixel planar target. Higher/lower quality changes their resolution and refresh interval. Reflection render targets and prefilter resources are reused and disposed when rebuilding. Brick, fabric and dry asphalt remain matte.

## Verification and remaining work

Build and focused regression checks pass. The runtime audit captures daylight, settled night, storefront and character views; confirms the reflection targets/materials are active; and verifies that pickup/artifact positions remain stable across updates. The sampled district contains roughly 350 meshes, with static architecture still batched. The earlier mission/journal/save flow is retained and checked.

Validation uses software rendering. Hardware FPS and reflection frame-time spikes require the developer’s machine. AAA-level results still need authored/scanned hero assets, skinned characters, animation, richer interiors, foliage, decals, terrain variation and sustained art direction; this pass does not claim those are finished.
