# Dark Rain — Step 10: cheapest-truth-first vertical slice

## Scope and demonstrator

**ONE fully destructible archetype: a compact three-story concrete commercial building with wooden interiors**, approximately 12 x 9 m footprint, 3.2 m floor heights. Ground floor: shop/loading bay. Upper floors: offices/storage with wood partitions and furniture. Concrete columns/beams/slabs and brick infill establish readable structure; glass storefront, timber doors, interior plaster and restrained steel fasteners demonstrate material differences without building a whole material library.

Use three stories instead of introducing a separate three-story garage after a two-story shop: one asset proves every requested stage. A tall, narrow corner bay makes loss of support and asymmetric tipping legible. An already damaged corner connection provides the surgical weak point, communicated through geometry/cracks and creaking, not a glowing objective marker. All other walls/supports remain destructible; the weak point is a favorable load path, not the only permitted destruction trigger. Avoid modeling an intact code-compliant frame that implausibly collapses from one ordinary bullet.

The setting is a small original Atlanta-inspired commercial lot with a street, sidewalk, back alley, realistic human-scale doors/windows and basic overgrowth. It is a mechanical/visual proof, not a claim of photorealistic Atlanta reconstruction or AAA completion. Scope is a testable plan, not an implementation claim. Current city destruction remains a compatibility checkpoint and the latest native captures should remain available for before/after comparison.

**Core sequence:** prove visible material loss and grounded debris -> prove support-dependent motion/connectivity -> prove tactical consequences -> add dust and one-chunk persistence -> duplicate the same archetype for a bounded block stress test. Rendering polish follows verified geometry/contact, rather than compensating for failure.

## Ordered tasks and gates

Each numbered task produces a runnable checkpoint. Do not advance past a failed gate. Stage-specific build/type checks and relevant tests precede native observation; build success alone cannot pass a visual/physical acceptance test. Use identical camera bookmarks and save profiles for comparisons. Preserve main menu, New Game/Continue, death-to-menu and existing combat through every stage.

### 0. Establish a repeatable baseline — core, physics, profiling (Steps 4/8)

Add an isolated developer fixture entry using the normal packaged startup/session flow, fixed seed and reset command. Provide camera bookmarks for street breach, cutaway structure and ground contact. Record current geometry/body counts, errors, frame-time distributions and known defects. Keep fixture content separate from ordinary city generation until verified; do not remove current systems to obtain a clean test.

**Accept:** boot/menu visible; fixture loads; player movement/shooting work; reset twice produces identical logical IDs/counts without accumulating bodies/listeners; actual death-menu button returns to a usable menu. Native WebGPU and WebGL2 are exercised. Capture intact/current chipped/current support-damaged reference images and report any unverified hardware behavior honestly.

### 1. Author the asset and bounded fracture kit — graph/compiler/fracture (Steps 1/3)

Create the one building prefab with explicit foundations, concrete frame, slab/wall connections, wood interiors and convex shard assets. Define local poses, material densities, connection frames, strength thresholds, support IDs and stable fracture lineage. Build the ground-floor wall/module first using the same eventual asset data, not throwaway replacement geometry. Start with offline pre-fracture generation; do not require runtime GPU fracture or Blender plugins to prove the system. Use fitted irregular chunks and shared fracture faces, with a few wood splinter shapes and glass shards.

Initial authoring target: **<=64 coarse gameplay structural pieces**, with detailed chipping using reserved child slots. Compile an exact member/shard/joint/hull count report. These numbers are targets to validate, not permission to declare omitted material indestructible. A piece may subdivide later without changing its authoritative retained geometry or breach. Convex decomposition must not fill doors, windows or holes. Use genuinely connected compounds only where logical bonds remain represented.

**Accept:** compiler rejects duplicate IDs, invalid mass, missing support references and incorrect joint anchors; intact assembly rests stably for 60 seconds with normal gravity, without creeping apart or spontaneously failing. All walls, roof/floors, supports and interior pieces have a valid damage path. Human door/stair dimensions fit actual actor collision. Asset count report fits the intended High/Ultra budgets or authoring is corrected before runtime conversion.

### 2. One wall, physical break and retained material — joint damage/debris (Steps 1/2/3/4)

Mount a pre-fractured wall segment on the fixture's real supports. Use material-calibrated bond damage, actual Rapier joints for relevant bonded members, and resting contact for resting material. Detach fractured pieces with correct mass/inertia/initial pose; maintain visible retained wall geometry and exactly corresponding collision. Introduce one shared debris admission ledger around the fixture, including moving/settled pieces and enabled hulls. Keep physical fragments distinct from disposable cosmetic fines.

**Accept:** repeated shots create progressively deeper local chips; shots elsewhere do not mysteriously enlarge the old hole. Camera/ballistic rays traverse only actual apertures. Detached fragments fall, hit the floor, settle and remain visible; no disappearing blocks, duplicate parent/children or persistent floor penetration. Meaningful material mass is accounted for within <=1% numerical tolerance, with explicitly accounted cosmetic fines. Test a full wall break and a capacity-pressure event; no failed bond becomes intact and no important material is deleted to fit a pool. Compare no-dust captures before/after.

**First milestone:** one wall reads as concrete breaking into concrete rubble, at correct scale. Stop here and improve geometry/contact/material appearance if it still reads as block deletion.

### 3. Event-driven connectivity and three-story support failure — graph/connectivity/physics (Steps 1/2/4)

Extend the same prefab to its complete three-story assembly. Rebuild affected connectivity after batched joint failures; track remaining grounded load paths. Use the cached support-demand estimate for overload-triggered failures until validated reaction measurement exists. Label that approximation in debug results. Do not confuse collision-force reporting with fixed-joint reaction loads or force both endpoints dynamic after every bond break.

The compromised corner must have a testable load path: destroying its column leaves a formerly supported bay overloading its remaining weakened connections. Those bonds fail under the declared capacity model; its unsupported island releases. Neighboring supported regions remain until their actual support demand/topology fails. Existing eccentric mass/contact geometry creates a visible tip where warranted; **no scripted tilt animation, synthetic tipping impulse or countdown substitute** in the hero test.

**Accept:** breaking a noncritical wall does not collapse the building. Removing one compromised column produces the expected local connection failures and corner-bay motion, with surviving support paths shown in the debug graph. Removing remaining critical ground supports produces full collapse. Reactions that do not exceed capacity do not fail merely to match the demo. Destruction is event-driven with no idle whole-building solve. If a column removal leaves the assembly legitimately supported, it stays supported; fix/calibrate the fixture's structural design rather than spoof the result. Capture tip onset, contact and settled rubble without dust.

### 4. Debris lifetime, support wake and restrained secondary fracture — debris/gravity (Step 4)

Reuse body/binding records, batch unique geometry and preserve stable reverse mappings. Add verified sleeping, wake-on-impact and support removal. Add one secondary-fracture path for a large concrete fragment only after primary debris works; reserve child capacity before retiring its parent. Keep exact physics for dangerous near pieces and explicitly supported far-state transitions. High begins with 96 awake debris /128 resident shells; Ultra's proposed 192/256 requires its own measured test, not automatic certification.

**Accept:** shoot a settled piece and see it wake; remove the floor beneath a resting fragment or loot and see it fall. A fragment landing on a desk/floor/rubble uses that support, not a terrain-height clamp. Secondary splitting does not visibly create/delete mass or inject unexplained launch energy; state/geometry ownership is atomic. Repeated damage/reset leaves counters stable. Body/hull/contact saturation is reported and handled without floating or erasing structural material. Full collapse settles into irregular usable rubble, not a standing facade assembled from stacked cubes.

### 5. Tactical breach and minimum readable audio — cover/combat/audio (Steps 5/6)

Add one defender using the existing AI, one cover patch query and one breached route. Material penetration and cover validation share actual collision/retained geometry. Add concrete/wood break signatures, a load-proportional warning emitter for the dangerous support, impact/settle foley and a bounded collapse rumble. Protect player fire/nearby threat footsteps in the mix; a full procedural material/audio library is unnecessary here.

**Accept:** the defender cannot be hit through the intact tested concrete patch with the chosen weapon, but can be hit through the new aperture. Remaining adjacent concrete still protects. The defender abandons invalid cover rather than shooting from yesterday's wall. A bullet-sized hole is not automatically walkable; a later body-sized opening has valid floor/capsule clearance. Creaking rises with the reported utilization and fades when load is safe; instantaneous failure is not delayed for a warning. Debris thumps align with contacts, resting rubble is quiet and collapse does not bury critical cues in a listening test.

### 6. GPU dust veil after physics is proven — TSL/effects/tactical layer (Steps 3/5/8)

Build one bounded local dust emitter with preallocated particle data. On WebGPU, TSL compute updates particle position/velocity/lifetime under gravity/drag/wind; rendering uses depth-tested soft particles and a low-resolution density layer. WebGL2 uses a bounded CPU/buffer-update fallback with the same emission semantics. Shared gameplay dust density remains consistent with visible concealment. Cap the slice at 1,024 dust particles per emitter and the Step 8 <=1 ms dust GPU allocation; measure both.

The building is a **hero structural-collapse asset**, so dust accompanies actual falling bodies; it must not swap a failing physics result for a fake rubble pile. Keep event/phase hooks compatible with Step 5 standard-tier swaps, but a separate authored macro-swap system is cut from this slice.

**Accept:** toggle dust off and the same collapse/breach/collision remains correct. Dust originates at fractures and impacts, has visible local depth rather than global distance fog, responds to wind and decays. From inside, the player still collides with falling material. GPU/GL fallback leaves no startup errors or missing particles. No sync readback/queue wait in the gameplay frame; capture render cost at full emitter occupancy. Future veil hooks can serialize a phase, but a full standard-tier veil handoff is not claimed complete.

### 7. Serialize and restore one chunk — persistence/authority boundaries (Steps 7/9)

Extend the existing SaveSystem/SaveStorage/Electron main-process store with the fixture's versioned destruction records, partial bond damage, failed IDs, exact fracture geometry or pinned assets, settled poses/supports and moving island pose/velocity. Use local resolved commands/stable IDs and topology revisions so multiplayer replay remains possible later. Scope storage to one chunk in the existing recoverable slot JSON; no new content-addressed multi-file save framework yet.

**Accept:** save after the breach, reload and fire through the same opening. Save during a tip/fall, reload and resume gravity without replaying historical shots/sounds or deleting moving material. Save settled rubble and re-enter with matching cover/passability. Repeat load three times: no duplicate bodies/geometry/loot/listeners. Near-failed surviving bonds remain damaged. Simulate a failed write and retain the previous valid save. No particle/GPU/physics handle is treated as persistent identity. Final load uses packaged Electron, not only a serialization unit test.

### 8. One-block cascade containment — chunk graph/streaming/profiling (Steps 2/4/5/7/8)

Only after one-building gates pass, instantiate **four copies of the same archetype in one compact city block**. Vary rotation and existing wear, not structural content or a new building library. Give each an independent support graph. A physical impact or explicit shared asset edge may connect structures; adjacency alone does not merge every building's graph. A spanning island can cross an authored block boundary, so containment is work/dependency partitioning, not an invisible wall that stops real collapse.

**Accept:** damage A; unaffected B/C/D do no structural recompute. Collapse A into B and propagate only the actual contact/damage consequences; B fails only when its capacity/connectivity warrants it. No automatic radius-based chain-reaction demolition. Two overlapping collapses remain gravity/collision-correct and inside measured allocations; backlog/overruns are visible. Repeat visits and accumulated rubble without leaks. Keep offscreen supported structures dormant, not invulnerable. Report the work/counters for graph jobs, contacts, particles, draws, memory and save payload.

### 9. Slice release gate — packaging/performance/visual comparison (Steps 4–9)

Package the same game entry and expose the fixture/demo through the developer menu. Publish a small comparison report: intact -> chips -> firing lane -> weak-point tip -> full collapse -> restored rubble, same camera/seed where relevant. Include no-dust proof, interior collision view and an Ultra/High comparison. Keep the ordinary game runnable; this slice is an added validated fixture before wider city migration.

**Accept:** packaged boot, New Game/Continue, death-menu, fixture reset and disk save/load pass. Profile the user's hardware first, with actual CPU/GPU/backend/resolution/profile recorded. Three ten-minute traversal/combat/collapse runs plus one 30-minute rubble soak must meet Step 8's 60 fps gate, including collapse and autosave frames; Ultra has a separate certification and may require stronger hardware. Main-thread/GPU work targets are <=10/12 ms. No current performance claim follows from writing this plan. If fidelity/collision or frame pacing fails, fix the failing task before city rollout.

## Demo scenario: one playable proof, not a cinematic

Provide separate reset/bookmark stages so each claim can be tested independently, plus one continuous 5–8 minute route:

1. **Baseline:** approach the shop, see a defender behind concrete cover and intact three-story supports. Fire a controlled burst at a noncritical patch; only local chipping occurs. Interior furniture/loot rests on real supports.
2. **Tactical sightline:** concentrate fire/tool damage on that same patch until an aperture forms. Shoot the defender through the actual opening; adjacent retained wall still blocks shots. Enlarge the opening and enter only after a capsule-clear route exists. Watch the defender relocate. This proves microdestruction changes the fight.
3. **Surgical demolition:** expose/attack the compromised ground-floor corner column with an appropriate heavy tool/charge. Observe localized creaking, confirmed support/bond failures, upper-bay tip and debris landing. Safe neighboring support remains visibly intact where valid. **Do not remove all foundations and call it a one-column demonstration.**
4. **Persistence during motion:** save on the tip/fall bookmark, reload and observe continued physical motion with no missing roof/slab; then continue from that same world state.
5. **Full structural collapse:** remove the remaining supporting load paths with separate targeted actions. The remaining frame/roof/interiors fall and collide under gravity. Dust and rumble accompany rather than replace the event. Repeat this stage with dust disabled to expose any geometry/physics shortcut.
6. **Aftermath:** traverse safe rubble, take cover behind a grounded slab, shoot it/wake or chip it, and inspect loot that fell with its shelf. Save/reload and retain the same breach, failed bonds, meaningful rubble and available route.
7. **Block stress extension:** reset to the four-copy lot; trigger two overlaps and an actual impact on a neighbor. Observe bounded affected work and physically justified propagation with no unrelated buildings collapsing.

The weak-point stage passes on local destabilization plus genuine motion; it need not instantly flatten a realistically supported whole building. Full collapse is a separate loss-of-support test. Both use the same hero asset, damage rules and physical material, not scripted replacement outcomes.

## Explicitly cut from this slice

- Runtime GPU Voronoi fracture, full-world voxels and arbitrary new hero geometry. Use offline fracture assets plus existing local chipping first. Arbitrary hit locations still damage retained material; offline fracture does not make whole walls invulnerable outside one trigger.
- A separate non-hero authored rubble/veil-swap pipeline. GPU dust is included; true hero collapse is the demonstrator. Standard swaps follow later with interior/no-dust validation.
- Full Atlanta/district generation, a second building archetype, skyscrapers, bridges and a new asset pipeline. District proof means one small block with the same prefab.
- Exact FEM/load solver or a new Rapier reaction-force binding. Use labeled cached support demand and contact-driven inputs; do not claim measured joint stress.
- Complete material fracture/audio catalogs, cloth/soft bodies, vegetation simulation, vehicle destruction and a weapons overhaul. Use the few materials and existing combat needed for the proof.
- Full faction territory/A-Life expansion, missions/story, mutant navigation overhaul and broad cover/nav rebuilding. One defender plus one validated breach/cover reaction is sufficient; persistent events keep expansion possible.
- Multiplayer/WebTransport, rollback, live join, migration across many asset versions, a new multi-file save format and chunk-network streaming. Keep stable IDs, resolved mutations and versioned chunk records now.
- Exhaustive Ultra promotion across the current city, blanket replacement of all legacy destruction, and any unverified AAA/60 fps claim. The slice supplies an evidence-backed asset and integration pattern first.

**Not cut:** gravity/support loss, retained material, actual meaningful debris collision, primary break-anywhere damage, weak-point support failure, tactical sightlines, full hero collapse, one-chunk persistence, native packaged playability and performance validation. These are the slice, not stretch goals.
