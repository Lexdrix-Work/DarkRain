# Dark Rain — measured fidelity pass

The Prompt 1 full-city 60 fps budget is **not locked**. Its baseline ended in renderer OOM. This pass improves material/occlusion behavior without altering fracture commands, support graphs, rigid bodies, mass, collision geometry, persistence or swapping the observed collapse for different rubble.

## Implemented upgrades and verification

| Upgrade | Why it is in | Cost evidence | Visual check |
| --- | --- | --- | --- |
| Local concrete PBR | Real albedo, OpenGL normals, packed ARM and displacement replace flat procedural concrete at close range. | Full-city delta unmeasured. Four shared RGBA textures with mip chains estimate 21.3 MiB at 1K and 85.3 MiB at 2K; not JPEG file sizes or measured VRAM. | View floor/column/fragment surfaces at an oblique angle, dry daylight and torchlight. |
| Rest-space fracture mapping | Triplanar color plus dominant-plane height/roughness projection eliminate side-face streaks and remain attached while shards rotate. | Warm component total 0.20–0.32 ms; incremental shader cost not resolved by these samples. | Inspect a rotated shard from each axis; watch its pattern through falling/settling and save/restore. |
| Mineral fracture finish | Distinct coarse aggregate, fine pits, roughness and fresh-cut color replace the old uniform brown cut faces. | Included in material component total above. | Compare flat-fracture.png and pbr-fracture.png. Geometry is identical. |
| Dynamic contact grounding | Existing one-draw contact layer now includes real structural shards, wall chips, broken models and city fittings. Selection is pooled/bounded, uses rotated height and retains at most 256 floor-cache records. | Included with AO component total 0.23–0.30 ms; CPU ray costs in a full collapse remain unmeasured. | Look below resting props and debris; contact shading fades as they leave the support surface. |
| Half-resolution GTAO | Eight samples from the real opaque world depth include moving debris and actors. Highlights are protected and strength is restrained. | AO/contact component total 0.23–0.30 ms; added cost is too small/noisy here to certify. | Enable Graphics → Contact occlusion. AO mask is non-white; validation also requires the pass to run every sample. Screen-space limitations remain. |
| Cohesive lens additions | Grain gains shadow-weighted low-light noise; optional grime is linked to bright glare; optional rolling shutter is tiny and movement-driven. | Lens component total 0.26–0.29 ms; isolated added cost unresolved. | Test bright anomaly edges, a dark room, and camera turns. Disable grain/lens effects or camera motion and confirm the respective effect is gone. |

The reported timing ranges come from a 1280×720 native **WebGL2 component fixture**, forward/reverse order, 120 samples per case, serial rendering plus GPU completion. They are total case times, **not per-upgrade millisecond estimates**. They exclude city simulation, emissions and ongoing structural collapse. Case order/cache effects and timer quantization are visible, so no negative added-cost or performance-win claim is justified. Current raw results and screenshots are under work/fidelity-check. A pinned r186 test adapter advances NodeFrame once per manual sample; frame effects cannot be timed once and then silently cached for the rest of the loop.

The fixture uses real Rapier convex shards settled by gravity, not a replacement rubble model. An RGBA mask view verifies AO because the installed WebGL fallback's single-channel readback does not provide a usable RED-format buffer. Native WebGPU and full-city costs still need verification. First-use compilation/upload cost is deliberately collected separately by the harness; the final cold-cost rerun encountered host memory pressure, so no complete cold-hitch result is claimed.

## Texture handling

Bundled Poly Haven Rough Concrete is CC0: https://polyhaven.com/a/rough_concrete and https://polyhaven.com/license. Provider hashes were checked; SOURCE.md accompanies the files. Runtime uses local files and has no Poly Haven network dependency.

Four maps use the existing asynchronous residency loader and its firm budget. Low selects 1K then limits it to 512; Medium uses 1K; High/Ultra use 2K. Shared maps retain their complete mip chains. Existing procedural families gain packed roughness/cavity detail; those approximations are not geometry-baked AO or scanned data. This is resolution-variant residency, not fine-grained mip streaming. KTX2/Basis remains supported by the existing loader, but this authored set is shipped as JPEG variants; compressed production variants are still future work. Maps are prepared during loading, not generated each gameplay frame.

## Shedding order and controls

Automatic quality reduces optional effects before touching simulation: rolling shutter → lens dirt → screen-space AO/close relief → cosmetic contact density. Ultra permits rolling shutter; High permits dirt; Medium retains the optional AO tier; Low suspends these extras. Scale below 85% or EMA above 16.7 ms drops to the AO tier; below 70% or above 18 ms suspends AO/relief. Above 24 ms the contact overlay reduces from 24 to 12 nearest contacts. Lower tiers are accepted immediately; recovery requires five seconds of stable headroom per step. Texture resolution follows the selected existing quality tier, not these per-frame effect levels.

Manual automatic-quality disable honors explicit effect toggles across presets. Contact occlusion and rolling shutter default off pending a valid full-city budget. Lens dirt remains subtle and only runs at an admitted tier. Full camera-motion disable suppresses rolling shutter; film-grain disable also suppresses low-light noise; lens-effects disable suppresses dirt and rolling shutter. Physics, destruction material, actual rubble, A-Life and anomalies are never removed by this policy.

This is a reactive guard. It cannot promise that an unexpected workload never causes a frame dip; predictive reservation needs Prompt 1's valid collapse/emission measurements.

## Still unfinished

- Actual geometry-baked AO for authored/static buildings, rather than material cavity maps.
- Exposed rebar with coherent attachment, collision, secondary fracture and persistence.
- Broader authored PBR/decay art, compressed texture variants and fine-grained mip streaming.
- Full-city and WebGPU visual/cost checks, cold-hitch elimination and a proven 60 fps destruction budget.

Existing time-of-day lighting, night windows and anomaly lighting were retained; this pass does not claim a new lighting overhaul or AAA art completeness.

## Final validation status

Type checking, production build, local executable packaging and 165 automated tests passed. Earlier native WebGL2 component captures and AO-mask checks passed. The packaged-game retest did not complete and reported graphics-process launch failure (error 18); its early process exit is not a successful gameplay check. Full-game validation remains outstanding.
