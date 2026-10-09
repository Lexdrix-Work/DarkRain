# FX, city destruction and immersion verification

Status: partial implementation; the city-scale destruction guarantee and 60fps acceptance gate FAIL. Do not label this pass complete or 100% verified.

## Working changes

- Native WebGPU compute updates material-impact particles, explosion sparks, collapse dust and local rain. Rendering reads GPU storage directly. Native readback checks verify movement, expiry, and rain's active-count limit. WebGL uses the existing CPU fallback; it is not advertised as compute.
- Concrete/brick produce dusty grey bursts; wood produces brown chips; metal produces additive amber sparks; glass produces pale flecks. These are cosmetic sprites, not replacements for physical fracture shards. Exposed rebar, material-specific splinter geometry and richer smoke remain unfinished.
- Muzzle/explosion/tracer illumination shares three fixed, shadowless burst lights. Tracers share one 50-slot draw pool. Muzzle flashes reuse the particle bank. Timed light decay follows game time, so pause does not run extra effect animation loops.
- Hidden compute particles, rain and tracers opt into loading-time shader precompilation. Native fixture verification includes tracer rendering and expiry. This does not prove that every game shader variant is warmed.
- Moving casters invalidate shadows each update; directional/flashlight changes invalidate them too. Before drawing, legacy dirty flags are translated into the actual per-light `LightShadow.needsUpdate` flags used by the node renderer. Sun/moon/flashlight automatic refresh is disabled, allowing stationary maps to be reused.
- The existing light-space texel snapping and bias remain in place. Native shadow comparisons cover 06:30, noon, 17:30 and midnight. At the exact horizon crossing, a light with zero direct intensity cannot produce a visible shadow; that is not a refresh test.
- Bloom strength is reduced and its threshold moved above normal display-white. Chromatic aberration preserves AO/bloom composition instead of replacing red/blue with raw scene channels. Stable display dither remains available even with film grain disabled. These need broader city image comparisons; they are not a clearance of every screen-space artifact.
- Viewmodels retract/lower near physics geometry. Head-bob/lean displacement is checked against physical obstruction. Full weapon/limb clipping validation remains open.
- Visible A-Life actors receive movement intentions instead of multi-metre position jumps. Actor movement queries current Rapier colliders, allowing breached openings and stopping at rubble/walls. Tests verify wall removal changes traversability. This is not a complete rubble-aware route planner or faction-territory reaction system.
- Destroyed foundations enter the physical promotion queue, including after restore and capacity retries. Large disconnected islands receive one batched topology revision instead of repeating connectivity for each member. Contact-load lookup no longer sorts every wall cell. Sleeping models retain their exact pose and resume synchronization on impact; their bodies/colliders are retained.
- Promotion now shares available slots round-robin across damaged buildings. The queue no longer exclusively serves the oldest tower. This does not solve the larger suspended-island limitation of member-by-member promotion.
- Horizontal-member support balance projects the resultant gravity load onto the convex hull of surviving bearing patches. When the overturning moment exceeds the remaining connections' moment capacity, bonds fail through the existing graph/connectivity pipeline. Released bodies tip through Rapier gravity/contact; no angular animation is injected. Strong connections may legitimately hold a cantilever. This is an axis-aligned bearing approximation, not full elastic deformation or city-wide physical island grouping.
- Wall hits accumulate persistent crack damage across a section's fragments. Default 68-integrity concrete releases after three base-20-damage impacts; thicker/stronger panels and steel use their own health/material multipliers. Shooting every individual shard is no longer required. Health damage and retained volume are separate in the load solver, so cracks do not make attached mass disappear.
- Chips receive at most 4 N·s of impact momentum at the actual hit point, then follow gravity. The previous backward 2.4m/s launch and random angular velocity were removed. Complete section failure disables remaining fixed shard colliders before promoting/queueing fragments. Crack damage and queued impact momentum/point survive save/restore.
- An early-hit compute initialization race found during native wall testing is fixed: events queue until asynchronous compute pipelines are ready, rather than dispatching an undefined pipeline.
- Fracture collider hulls now match their visible geometry. The old 90% chip / 92% hero-shard inset could leave rendered surfaces sunk below collision support, then expand the collider when freezing. Those insets are removed; a floor-contact regression checks the visible chip bottom. Damaged/queued shard state survives reload without reintroducing fixed scaffolding.
- Ultra city concurrency increases to 144 primary structural bodies, 64 chips, and 256 combined structural/chip bodies. Other presets retain 48 primary, 32 chips, and 96 combined. Secondary fracture reserves the net three additional slots. These are concurrency limits, not a destruction-state or rubble deletion limit. Fittings, props, actors and the separate hero fixture are not included in this combined count and still require a unified world-body budget.

## FX triggers, cost and shedding

| System | Trigger | Native measured cost | Shedding / remaining work |
|---|---|---|---|
| Concrete/wood/metal/glass impacts | `effect:impact` | Component fixture total update + render + GPU drain; see `work/fx-check/webgpu.json`. Incremental city cost unresolved. | Reduce new cosmetic emissions; physical chips unchanged. |
| Collapse dust | Masonry detach and secondary fracture | Same compute bank, separate scene pool; full-collapse GPU cost unresolved. | Reduce cosmetic density; never remove physical mass. Veil transition is not implemented. |
| Explosion particles | `effect:explosion` | GPU integration verified; representative city blast cost unresolved. | Bounded emission queue and storage banks. Ember/smoke material separation unfinished. |
| Rain | Weather intensity > 0.1 | GPU motion/count cap verified; full weather cost unresolved. | Draw/dispatch active count follows quality and cosmetic density. Roof/terrain shelter mask unfinished. |
| Muzzle flash / tracer | Shot events | Pooling and native tracer rendering checked; incremental lighting cost unresolved. | Fixed light and tracer counts. These lights do not cast occlusion shadows; wall leakage remains a bug. |
| Anomaly energy | Existing anomaly volumes | Existing compute field retained; emission/collapse combined GPU cost unresolved. | CPU anomaly damage/forces unchanged. |
| Blood / wounds | Actual damage and bleeding | Existing system retained; compute migration unresolved. | Critical damage information must remain legible; not all blood is GPU-compute driven. |
| Local volumetric fog / shafts | Weather and local light volumes | Not implemented; no measured headroom allocated. | Existing no-distance-fog choice retained. |

Do not add component total timings to infer a beauty budget or claim measured incremental costs. The fixture excludes city simulation, destruction geometry and most lighting. Its warmup/order, resolution and GPU-drain metric are recorded in the report.

## Quality envelope and full shedding order

| Preset | Impact/dust bank capacity per pool | Rain preset maximum | Contact overlay slots | Resident texture ceiling | Proposed beauty allocation, NOT achieved headroom |
|---|---:|---:|---:|---:|---:|
| Low | 256 + 512 | 6,000 | 12 under severe pressure, otherwise 24 | 256 MiB | 1 ms |
| Medium | 256 + 1,024 | 10,000 | 12–24 | 512 MiB | 2 ms |
| High | 512 + 2,048 | 15,000 | 12–24 | 1,024 MiB | 3 ms |
| Ultra | 1,024 + 4,096 | 20,000 | 12–24 | 2,048 MiB | 4 ms |

Effects and masonry dust each own a pool; these per-pool capacities are not whole-world totals. Physics capacity follows the separate table above. Texture ceilings refer to the existing residency budget, not measured GPU VRAM.

Declared combined order: resolution → rolling shutter → lens dirt → cosmetic particle emission density → screen-space AO → close-surface relief → cosmetic contacts → distant vegetation density → reflection update rate → bloom → shadow resolution.

Implemented coordination: the existing resolution governor; immediate optional-effect pressure reductions; delayed five-second recovery; particle/rain emission density of 25/50/75/100%; relief/AO/lens gates and contact slots. Several gates can shed together under severe pressure. Vegetation/reflection/bloom/shadow changes remain existing settings, not a fully integrated sequential automatic ladder. The resolution governor still tolerates 45fps before reducing scale: that conflicts with the requested 60fps target and remains a performance blocker. Authoritative fracture, physics, connectivity and persistent rubble are not removed by the visual governor.

## Actual-city verification

`npm run verify:city-destruction` loads the full configured Atlanta city with its real systems. It does not spawn the test fixture or shrink the city. Reports and images are in `work/city-destruction/`.

Coverage audit: all 142 generated buildings have a support graph. This is coverage, not proof that all collapse correctly. The city uses generated support/load graphs and later individual rigid-body promotion; the Rapier fixed-joint lifecycle remains isolated in the hero fixture. Genuine wood-frame houses and parking garages are absent from the current Atlanta authoring. Short masonry shops are not relabeled as houses to make the test pass.

Selected actual buildings:

| Structure ID | Actual generated type | Foundation charges |
|---|---|---:|
| `structure:38.20,14.96` | 28-floor stucco commercial tower, 10,355 graph members | 66 |
| `structure:-129.80,-11.26` | One-floor stucco shop, 550 members | 50 |
| `structure:-17.80,14.45` | 26-floor brick tower, 9,601 members | 63 |

The harness zeros each identified ground anchor's health through the generated support pipeline. These are not deployed player explosives on measured physical joints; that required mechanism does not exist city-wide yet. Each case has a bounded 30-second / 600-frame observation window. A partial collapse fails rather than being declared settled. Secondary cases run while the earlier city's destruction remains present. Save/load uses an isolated Electron profile and manual slot 5, not the user's saves.

The first complete post-crash-fix run measured p95 intervals of 110.2 / 100.1 / 180.1 ms. The next run measured 110.1 / 90.2 / 200.2 ms, with physics p95 of 26.5 / 65.4 / 90.8 ms. Neither proves 60fps. These are serial simulation/render/GPU-drain workloads and RAF cadence, not a presentation trace; the scenarios evolve and cannot establish a controlled optimization payback. The tower produced 139 settled rubble records, with exact settled-record/broken-ID restore matching. The other buildings produced no rubble during their observation windows because the first tower monopolized promotion. Comparing two empty rubble sets is not positive persistence evidence.

Earlier street-level captures faced nearby walls, so they are not adequate demolition screenshot proof. The final harness uses a noon elevated observer with noclip, recording its camera parameters and targeting the actual building. This is a stress/demo observation camera, not a normal-play FPS claim. Screenshots remain subject to manual review; automated `screenshotsReviewed` is deliberately false.

Blocking bugs:

1. **City structural physics:** no city-wide measured fixed-joint lifecycle or physical island grouping.
2. **Debris promotion / scheduling:** large unsupported sections remain visually suspended behind the global body queue; one tower starves later structures. No convincing complete collapse in the tested windows.
3. **Frame-time architecture:** full-city collapse exceeds the 16.67 ms budget by a large margin; RAF/serial workloads do not establish presentation pacing. Unlimited retained fitting bodies and their individual draw objects need inclusion in the world budget.
4. **City authoring:** genuine wood-frame house and garage archetypes are missing; the required diverse proof is unavailable.
5. **AI navigation / A-Life:** collider-based traversal is repaired, but rubble route planning, cover rebuilding and faction relocation are not verified.
6. **Far-field destruction:** dust veil transitions are absent; no canned rubble swap was added to conceal this gap.
7. **Settled-debris interaction:** settled batching retains shapes/colliders, but general re-fracture and reactivation of every settled piece when its support changes are not implemented. The break-anywhere guarantee is therefore incomplete beyond first/secondary fracture.

## Graphical bug register

All unresolved entries require before/after captures; “unverified” is not accepted as a pass.

| Priority / class | Reliable repro procedure | Change / disposition | Evidence status |
|---|---|---|---|
| P0: suspended collapse | Three city IDs above; demolish all listed anchors mid-emission; observe 30 seconds | Foundation queue and batched topology fixed; body scheduling/island physics unresolved | Native city run FAIL |
| P0: crash on rubble | Generate first rubble batch; allow incremental memory scan | Batched matrix dirty shim no longer dereferenced as an array; matrix/indirect texture memory counted | Regression test and native three-case run pass without this crash |
| P1: stale moving shadows | Fixed camera `(5,3.5,7)` looking at `(0,.5,0)`; 24m ground; 0.8×1.8×0.6 caster moves x=-2→+2; 06:30/12:00/17:30/00:00 | Correct per-light dirty flags; immediate motion updates | Native WebGPU before/after in `work/shadow-check/`; controlled case PASS |
| P1: shadow acne / detachment | Same fixture, then city rubble; rotate camera grazing ground at each time; inspect thin rails and wall corners | Existing sun/moon bias -0.00008, normalBias 0.012; spot bias -0.0003, normalBias 0.02 retained | Controlled images available; exhaustive grazing/thin-material check OPEN |
| P1: shimmer / crawl | Freeze clock at noon; strafe in 1cm increments; then hold camera/time stationary for 10 seconds | Existing light-space texel snapping retained | Numeric tests; native temporal comparison OPEN |
| P1: cascade seams | Walk 10/35/75/150m from a building at dawn/noon/night | Current celestial shadows use one 72m map, no cascades | Cascade seams N/A; shadow-volume boundary transition OPEN |
| P1: light leakage | Closed interior wall/door, then stacked rubble; fire outside and inspect opposite side; repeat flashlight at 00:00 | Shadowed flashlight refresh repaired; burst lights remain shadowless; ambient/hemisphere fill remains approximate | OPEN; zero leakage not claimed |
| P1: floating contacts / penetration | Tilt shard onto ground and onto destructible support, wait for sleep, break support, reload | No artificial structural launch/spin; exact sleeping pose sync; existing conservative settling retained | Physics tests pass; full pile visual/CCD review OPEN |
| P1: camera / weapon / limb clipping | Face solid storefront at 0.3m; lean/bob; crouch beneath low beam and stand; repeat widest rifle ADS/reload; inspect ragdoll on stairs | Head displacement obstruction check and weapon retraction added | Actor collider tests pass; per-weapon/limb screenshot sweep OPEN |
| P1: animation teleport / snaps | Watch A-Life party 2m in front of camera for 10 seconds; trigger alert while it walks; equip/reload all weapon families | A-Life now updates walking goal instead of position; physics movement uses current colliders | Regression tests pass; transition/T-pose asset sweep OPEN |
| P2: z-fighting | Noon grazing view of posters, road markings, bullet decals and stacked fracture faces | Existing decal offset retained; no broad poster/marking change | OPEN |
| P2: transparent sorting | View broken glazing through rain/dust; orbit two overlapping plumes at noon/night | Additive spark/tracer pools; ordinary dust alpha and instanced glass still require ordering review | OPEN; weighted OIT not implemented |
| P2: AO halos / SSR edges | Enable AO+chroma at 12:00, stand 0.5m from rubble, pan across screen edges; repeat reflective wet road | Chroma preserves composed AO/bloom channels; GTAO clamps retained | Native material fixture retest; SSR/edge sweep OPEN |
| P2: bloom blobs | Look at white wall at noon and luminous window/anomaly at midnight, fire repeatedly | Higher HDR bloom threshold, lower strength; pooled brief muzzle flash | Native shader retest; full emissive comparison OPEN |
| P2: banding | Grain off; sky at 06:30 and dark wall at 00:00; capture PNG and inspect gradients | Stable sub-code-value display dither | Native shader retest; gradient inspection OPEN |
| P2: LOD / texture popping | Walk/fast travel across forest streaming and texture quality boundaries, then reverse direction | Existing streamed forest LOD retained; no new general texture residency crossfade | OPEN |
| P2: fog consistency | Cycle rain/emission/fog presets at 12:00 and 00:00; view city/wilderness boundary | Global distance fog remains disabled by existing artistic choice; no new global fog layer | Local fog/shaft implementation and boundary comparison OPEN |
| P2: temporal ghosting | Fast 180° look past railings/tracers, rolling shutter enabled then disabled | No temporal accumulation added; grain/dither are not history buffers | Native fast-pan video review OPEN |

## Reproduction commands and build limits

- Normal source checks: `npm run check`, `npm test` (sequential test execution is recommended on this host).
- Native component checks after a build: `electron scripts/verify-fx.cjs`, plus `--webgl` for fallback; `electron scripts/verify-shadows.cjs`.
- City proof: `electron scripts/verify-city-destruction.cjs --darkrain-memory-recovered`. Failure/timeout is written to `latest.json`; no prior successful report is silently reused.
- Default build: local Three modules avoid the large bundler memory peak. Set `DARKRAIN_LOW_MEMORY_BUILD=0` only for a fully bundled comparison build. It copies exact installed Three modules/addons/license locally and emits import maps. No CDN, runtime network dependency, renderer downgrade or change to physics. The normal build command was verified without special memory flags. Native test scenes exercise this packaging mode.

The final executable and tests must be checked after the last code change. A successful build or component image is not complete-game, city destruction, FPS or exhaustive graphical QA proof.

## Support loss and wall-crumble native evidence

`work/shadow-check/results.json` includes the production wall pipeline as well as shadow refresh. The 40kg plank on two bearings tipped through 0.491 radians (28.2 degrees) after its left bearing was removed. No launch velocity, angular impulse or scripted rotation was applied. The remaining bearing continued colliding with it.

The 1.2×1.2×0.25m concrete section was seated on the ground and hit three times at base damage 20. It released 18 physical pieces with mass 756.000002kg versus 756kg before fracture. All 18 pieces settled after three simulated seconds with the matching collider fix; their geometry and mass were retained. Pieces may rest against other real rubble; this test does not claim every piece must lie flat.

Before/after PNGs: `work/shadow-check/support-loss-before.png`, `support-loss-after.png`, `wall-crumble-before.png`, `wall-crumble-after.png`. These are controlled subsystem proof, not substitutes for the failing actual-city guarantee.

Compute follows the local storage-buffer workflow described in the [Three.js storage node documentation](https://threejs.org/docs/pages/StorageBufferNode.html). The implementation runs from bundled files, not network assets.

The packaged three-building run after fair scheduling still failed: p95 130.1 / 100.0 / 230.2ms, with 150 / 6 / 0 rubble records. The tower and shop's generated rubble survived reload; the last case did not generate rubble within its window. Fair scheduling helps distribution, but does not establish credible complete collapse or 60fps. These figures precede the subsequent support-balance and wall-cracking changes; they are a failing baseline, not current optimization claims.

Final packaged wall session: `work/wall-session/results.json` passed on WebGPU with the full 142-building city. The real brick wall `wall:-150.20,-156.54`, pane 0, retained crack damage 60 and remaining health 8 across an Electron manual save/reload, then released on the third base-20 hit. Eighteen moving fragments remained in the world and the next game render completed. This is one real-city wall/session check, not a macro-collapse or 60fps pass.

Final source checks: 188 tests passed, TypeScript check passed, the normal production build succeeded without memory flags, native WebGPU and WebGL FX checks passed, dawn/noon/dusk/night shadow checks passed, and the executable package was refreshed. Remaining graphical and city-scale failures above remain open.
