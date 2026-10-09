# Destruction retention and tunnel repair — October 9, 2026

## Player performance baseline

The supplied F3 capture reports 48.2 FPS, 20.77 ms average interval, p95 24.10 ms, p99 40.30 ms, 2,721 draws, 2.835 million triangles, 12.10 ms render submission against an 8 ms budget, and high memory pressure. GPU time was unavailable. This is a player measurement, not a measured before/after comparison on the native test harness.

Automatic resolution now responds above 17.5 ms rather than tolerating 45 FPS. It reduces scale by five percentage points every two-second check, or ten points above 25 ms, down to 50%. Recovery needs ten successive checks at <=16.8 ms with CPU submission below 12.5 ms, then adds 2.5 points. Manual quality remains respected. This fixes the policy error; it does not prove a 60 FPS lock or solve CPU-limited destruction.

## Implemented physical-material lifecycle

- Physical records have no expiry timer. The legacy impact-fragment path no longer evicts old fragments to admit new ones. Session teardown and deliberate replacement still remove old representations.
- Secondary fracture clips the existing mesh into closed pieces. It does not fill an irregular shard's bounding-box corners with new material. New batch slots cannot overwrite neighboring settled fragments. Mass, geometry, velocity and angular velocity are retained in saves.
- Individual concrete wall shards can fracture on hard ground impact. Contact-driven triggers require pre-impact speed above 3.5 m/s and force above three times the piece's weight; the retained fall-speed fallback also detects abrupt stopping. Secondary depth is currently one additional split into four pieces, with deferred splitting when the body budget is full.
- Unsupported connected city members become retained compound rigid assemblies, carrying their original facade and glazing geometry. Source instances are suppressed only after a replacement body and renderable exist. A transferred source is not evidence that the building has fully collapsed.
- Exact adjacent-box merging reduces collision subdivision while preserving actual holes and member/render identities, including rotated facades.
- Ground-floor piers and foundations no longer have overlapping permanent scaffolding behind their breakable cells. Shelves and their supports have finite strength too. High-rise reinforcement scales with height; intact 1-, 3-, 12- and 32-floor shells are checked for spontaneous failure.
- Contact overload can separate unsupported assemblies along floors and then bays. This uses a coarse shock-load heuristic weighted by material density/category, not a validated engineering stress solver or a city-wide Rapier fixed-joint network. High allows 64 awake assemblies, Ultra 192. Larger pieces remain physical and visible when further subdivision has to wait. Sleeping assemblies and their poses persist.
- Dynamic assemblies reuse their city materials and stable instance-buffer layouts. Completed source batches no longer submit hidden zero-scale instances. Collider edits in a simulation transaction rebuild each changed source once rather than once per chip.

## Tunnel

The optional introduction now uses a 12 m-wide semicircular road bore with wrecked vehicles, an actual rear rock blockage, two reachable maintenance rooms, grounded supplies, worn pavement, hanging service signs, drains, rusted pipes and a wooded surface approach. The rubble was repositioned after native captures exposed initially overlapping bodies. The daylight apron remains playable until 65 m along the route, allowing the player to walk out before the outskirts transition.

Fresh tutorial sessions clear carried items and weapons. A separate game-start detector grant is skipped. The first flashlight is in the entrance supplies; medical items, a pistol, ammunition, water and a detector are placed later. The tutorial flashlight toggle requires finding the item. Supplies remain searchable through the existing inventory system. Tutorial container references are rebound after loot restoration rather than continuing to modify stale containers.

Vehicle bodies use compound collision for their body panels, open cabin and wheels. These are original procedural wrecks, not production-quality vehicle assets. Vegetation and tunnel dressing still need further art work; this pass does not claim AAA fidelity.

## Verification and remaining blocking failures

The full suite passed **197 tests**; TypeScript checking passed. Final targeted checks cover the later tunnel geometry adjustments. The native WebGPU tutorial check recorded zero starting items, zero weapons, successful flashlight collection, entrance into a side room, three physical vehicles and successful session save/reload. Native screenshots are in `work/tunnel-check/`.

The real Atlanta tower at `structure:38.20,14.96` was also tested, with all 84 generated foundation anchors damaged. In the latest archived diagnostic run, its material was retained across 66 assemblies, with 11,025 members represented, seven settled small rubble records and a matching saved small-rubble/broken-source snapshot. Most assemblies had fallen only about 0.6 m after 159 fixed simulation ticks (2.65 simulated seconds). The tower still looked predominantly upright: **this is not an accepted full collapse**. The earlier harness's `collapseComplete` field only checked source transfer and overstated that result; the updated harness distinguishes `sourceTransferred` and checks the remaining physical height. Island-state persistence additionally has independent pose/membership/mass regression tests; the old harness's `reloadMatch` alone does not prove that entire pipeline.

That diagnostic run measured p95 **230.9 ms** under serial update/render/GPU-drain conditions, with Physics mean **17.3 ms**, native Rapier step mean **6.1 ms**, and 101 retained city bodies counted by the harness. These are not presented-gameplay timings and are not comparable to the player's 48 FPS screenshot. Nevertheless, the run fails the requested performance acceptance criteria. Earlier subdivision experiments had severe multi-second stalls and are preserved as failed reports, not advertised as wins.

Remaining blocking work: convincingly completing large-building collapse and settling, qualifying the full city under realistic presented destruction load, true city joint-load/cascade integration, bounding all physics categories together, settled-rubble reactivation, and verified AI path/cover updates. Real wood-frame-home and parking-garage archetypes remain absent. No 60 FPS, full destruction guarantee, exhaustive visual QA, or 100% reliability claim is made.

Latest diagnostic artifacts are under `work/city-destruction/`; previous failed experiments have `pre-*.json` snapshots. `scripts/verify-tunnel.cjs --packaged` verifies the refreshed local executable; `scripts/verify-wall-session.cjs` checks real city wall damage through packaged Electron save/load.

Final packaged checks passed: `verify-tunnel --packaged` confirmed the empty-handed start, collectible flashlight, reachable room, three vehicle bodies and save/reload; `verify-wall-session` found the real brick wall `wall:-150.20,-156.54` in the 142-building city, retained partial damage (60 accumulated damage, eight health) through Electron save/load, then released 18 moving physical pieces on hit three and rendered successfully. Neither test establishes complete tower demolition or its performance target. The refreshed executable is `release/win-unpacked/Dark Rain.exe`.
