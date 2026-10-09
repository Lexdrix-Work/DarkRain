# Dark Rain — Step 4: debris manager on Rapier WASM

Next subsystem: [Step 5 — tactical destruction, cover queries, tiered collapse and gravity](destruction-tactical-layer.md).

## Status and scope

Design contract built on [Steps 1–3](destruction-joints.md), reviewed against the installed Rapier 0.21 API and current game source. This document does not claim that pooling, ballistic LOD or fixed-joint city assemblies already ship. The current game creates bodies when sections detach, batches settled geometry, preserves rubble in saves, and limits several fragment categories separately. It does not yet have one global debris budget or reusable physics-body pool. Keep the existing playable checkpoint while these boundaries are migrated individually.

The manager owns representation, residency and budgets. Structural topology owns connectivity and joint damage; fracture owns geometry and lineage; Rapier owns active contacts and rigid-body motion. Rendering and distance never repair a broken bond or decide whether a breach exists.

```text
Fracture asset / runtime fracture result
  -> stable shard record: shape, material, volume, COM, inertia, lineage
  -> structural bond graph + external supports
  -> debris admission / island representation decision
       -> fixed-joint shard assembly (near, breakable)
       -> compound island body (intact connected island, bounded cost)
       -> swept ballistic record (noncritical distant loose debris)
       -> frozen rubble + streamed static collision
  -> transform arrays -> geometry/material render buckets
  -> contact events -> damage / secondary fracture -> graph update
  -> persistence ledger, independent of body/render residency
```

## 1. Joint lifecycle

**Create.** Instantiate only a resident assembly. Resolve stable shard IDs to current body slots, then create fixed impulse joints using the authored local anchor frames. Welded, bolted and embedded bonds use separate material limits. Resting contacts use unilateral contact and friction, not fixed joints. Disable contacts only between directly bonded neighbors with the joint contact setting. Fixed-to-fixed bonds cannot reveal meaningful dynamic weight redistribution: unaffected buildings may remain static, but a region being evaluated for physical load must use dynamic bodies with actual fixed foundation/support attachments.

**Accumulate.** Copy numeric data out of Rapier's contact-event callback immediately; never retain its borrowed event object. Deduplicate an impact by event ID, body generation and fixed-step index. Convert a contact force to an impulse over the physics substep, not the render frame. Distribute an impact to nearby connected bonds with normalized weights; do not charge the full impact energy to every edge. Maintain distinct peak force N, impulse Ns, energy J and torque Nm limits. Use a dead zone, immediate failure for a calibrated catastrophic overload, and time-scaled damage only above the sustained-load limit. Ordinary supported gravity must not accumulate damage indefinitely. A thresholded contact-event stream cannot establish that loads below its reporting threshold are absent.

**Reaction limitation.** Contact-force events describe collisions, not fixed-joint reaction forces. The installed JavaScript `ImpulseJoint` declarations do not expose a public general reaction-force/impulse getter. Until a validated WASM binding exposes that measurement, use the existing event-triggered support-demand estimate as an explicitly approximate joint-load input. Recheck affected supports after topology, mass or contact changes. Do not claim physically exact load cascades from collision events alone. Rapier still steps active physics regularly; the application avoids a whole-building structural scan every frame.

**Break.** Mark an edge failed once, queue removal, and remove the actual joint between physics steps. Clear the transient handle and restore neighbor contact. Retain the edge's stable ID and irreversible damage in the graph/save. Wake affected bodies and schedule one connectivity rebuild for the affected building after the batch of removals.

**Promote islands.** Rebuild union-find over surviving bonded edges, excluding resting-contact edges. Check each resulting component against surviving external supports. A supported component retains support; an unsupported component becomes moving material. It is not necessary to release every neighboring shard just because one bond breaks. Preserve intact internal bonds as a jointed assembly or, if no internal bond must currently be evaluated, one compound body with the shard hulls in local frames. Compound internal bonds remain in the logical graph; expand the compound into shard bodies before an impact requires another internal break. Compute the component COM, mass and full inertia with the parallel-axis theorem. Remove inactive per-shard bodies while the compound is authoritative to avoid double collision or mass.

Ordinary union-find does not undo deletions; rebuild only the affected building graph. Its cost is O((V + E) alpha(V)). A large rebuild can be queued/time-sliced, but it must not publish partially updated support classification. Unsupported material keeps a moving aggregate representation while detailed work waits, not invisible collision or renewed support.

## 2. Mass, inertia and pooling architecture

For each authoritative shard, mass is material density times closed-mesh volume. Integrate COM and the inertia tensor from the actual closed shard volume during authoring, or use Rapier's hull-derived properties as a documented approximation. Density and volume alone do not determine inertia: shape and mass distribution matter. The current graph compiler's box inertia is only an initial approximation.

Use one mass-properties authority. Install mass, COM, principal inertias and the principal-axis orientation on the collider, or install body mass properties with zero-density colliders. Never apply both. If a collider has a small clearance to avoid wedging, retain the unshrunk shard's authoritative mass and inertia. Do not increase tiny fragments to an arbitrary minimum mass; classify sufficiently small fragments as cosmetic instead.

Preallocate on level/chunk preparation:

- A structure-of-arrays shard registry: stable ID, generation, material/asset IDs, mode, island, parent, fracture depth, mass, COM/inertia, current/previous pose, velocities and binding slots.
- A fixed-capacity free-list of body slots, resident collider slots, logical joint records and render instances. Use generation counters to reject stale queued events after a slot is reused.
- Disabled Rapier body/collider shells grouped by compatible shape templates; cached authored hull shapes and joint descriptors. Actual removed Rapier joints cannot be retargeted/recycled as live handles: recreate them only during a bounded topology event.
- Fixed-capacity queues for admission, promotion, wake, fracture, transform upload and eviction. Queue overflow coalesces duplicate work or retains a coarse representation; it never overwrites an unprocessed structural failure.
- Reusable vectors, rotations and matrices for reads/uploads; use Rapier's target-argument transform/velocity getters. Dense active-slot iteration replaces per-frame Array spreads, filters, sorts and new Maps/Sets.

**Acquire:** reserve the complete transaction first; disable the slot; clear prior joints/identity, forces, torques, velocity, CCD/collision settings and additional mass; install the cached shape and mass properties; set pose/velocity; bind the new generation; enable and wake. **Release:** preserve authoritative state first; remove incident joints; disable collision/body; clear both directions of the mapping; return the slot once. Do not park an enabled body offscreen, where it could still collide or consume solver time.

The target is zero application allocations during an unchanged simulation/render frame. New hulls, Rapier joint creation, chunk loading and fracture may allocate during bounded events. Rapier/WASM can allocate internally; pooling is not a promise of zero engine allocation. Pool capacity is warmed gradually behind the loading screen, never increased silently during combat.

## 3. LOD, sleeping and residency

Distances are initial tuning values, measured from the closest relevant observer/player. Importance and predicted interaction override distance. Apply LOD to a bonded island atomically, never to individual members still constrained to each other.

| Mode | Admission and behavior | Exit / promotion rule |
|---|---|---|
| Near rigid-body | Enter within 25 m, or for immediate cover, character, structural or heavy visible-collapse interaction. Fixed 60 Hz Rapier; interpolated rendering. CCD on fast/high-risk bodies. | Consider demotion beyond 35 m after 2 s without relevant interaction, provided the entire island is eligible. |
| Mid ballistic | Normally loose, noncritical debris at 35–100 m. Integrate translation and orientation from stored velocities/gravity at 30 Hz; interpolate visuals. Sweep a finite-size conservative shape along each segment. No jointed assembly becomes independent ballistic shards. | Promote before a predicted collision with characters, breakable supports, moving bodies or tactical cover; transfer current pose/velocity without a jump. Static terrain contact may settle eligible small debris. Never clamp only against a flat ground height. |
| Far frozen | Beyond 120 m and already settled on verified static support, quiet for at least 0.8 s. Retain exact transforms, IDs and fracture state. Stream static compound collision by nearby spatial chunk. | Rehydrate collision before the player enters the chunk; a hit resolves the shard and promotes it before applying its impulse. Unsupported/airborne debris continues a coarse trajectory instead of freezing in midair. |
| Archived | Chunk more than 250 m away, outside view and no predicted interaction. Write persistent debris/support state before releasing render and collision residency. | Restore the same leaf shards and poses when streamed back. This unloads representation, not rubble from the world. |

Use a 100/120 m hysteresis band between mid and far residency. Consider future observers/vehicles and impact travel time, not camera distance alone. Large falling slabs or debris that can change support stay authoritative Rapier/compound proxies even beyond the nominal near range.

Let Rapier sleep quiet dynamic bodies. Sleeping still retains their body/collider slots. Keep pieces resting on destructible supports wakeable; support removal invalidates their sleeping/frozen status. Freeze only after low linear/angular speed, verified support and no pending support change. Track frozen rubble-to-support dependencies so a later collapse wakes what rests on it. A bullet ray or explosion query can identify an unloaded/frozen shard from the persistent spatial ledger before its collider exists.

Meaningful concrete, metal, wood and glass rubble has no distance-based expiration. Render-cull initially around 180–220 m without altering collision/cover state. Only cosmetic dust, sparks and negligible splinters may expire after roughly 5–12 s or outside 60–90 m; they never carry structural mass or block the player.

## 4. Body and event budget

Start conservatively and profile actual gameplay before raising limits. These are proposed limits, not measured 60 FPS guarantees.

| Resource | Initial hard limit / target |
|---|---:|
| Awake debris bodies, across every debris category | 96 total |
| Reserved priority admission within those 96 | 16 slots |
| Resident debris body shells, awake plus sleeping | 128 |
| Enabled debris collider hulls | 512 |
| Active physical fixed joints | 256 |
| Ballistic loose-shard records | 1,024 |
| Detailed fracture depth | 2 secondary levels |
| New bodies or representation changes per fixed step | 8 ordinary; priority reserve for critical transactions |
| Secondary fracture jobs per rendered frame | 2, further bounded by available child slots |
| Debris bookkeeping / admission work per render frame | 0.5 ms soft target |
| Physics slice at 60 Hz | 2–3 ms profiling target, not a hard runtime ceiling |

Actors, props and ragdolls have separate reservations and contribute to a shared physics-time/contact budget. Their bodies are not secretly counted as free debris capacity. Count sleeping bodies, compound child hulls and joint constraints: a 20-hull compound costs one body slot but twenty collider slots. Pool storage alone does not determine solver performance.

At saturation, first demote eligible distant loose debris, archive safe far rubble and defer secondary subdivision while keeping its parent body visible/collidable. Represent newly unsupported connected islands as compound bodies using reserved capacity. Admission for a jointed island is all-or-none. If detailed child bodies cannot fit, keep a coarse moving representation and the broken logical graph; do not delete mass or pretend the failed support survives.

A hard cap necessarily reduces fidelity during extreme collapse. Arbitrarily many near-field loose shards cannot all receive exact independent physics under a finite cap. Beyond reserved compound capacity, use conservative swept coarse trajectories and lower-detail collision proxies, prioritize player safety/cover, and record this approximation. Do not recreate bonds simply to fit a budget. A split needing k child bodies reserves its net additional body/collider/render/joint capacity before retiring the parent.

## 5. Secondary fracture

Use relative contact-normal velocity and effective mass to estimate available impact energy, or validated contact work; do not use downward speed alone. A material-specific fracture threshold depends on toughness, new cut area, existing damage and retained fasteners/rebar. Deduplicate sustained contacts, apply a fracture cooldown and reject splitting for settled jitter.

At a qualifying impact, obtain preauthored children or an event-generated fracture result. Verify child volume, COM, hull validity and the budget reservation before replacing anything. Child mass sums to parent mass; weighted child COM equals parent COM. Initialize child velocity as parent linear velocity plus parent angular velocity crossed with its COM offset. Distribute any residual impact impulse/rotation under the collision's available energy budget; do not inject arbitrary explosion energy. Remap surviving external bonds to child connection surfaces, create surviving internal child bonds, and retire the parent atomically. Preserve aggregate linear/angular momentum within the declared solver/collider approximation.

Stop at two secondary levels or the material's minimum physical shard volume. Detailed child meshes can share one coarse compound collider until physics slots become available; retained coarse collision must not close an authoritative breach. Cosmetic powder is a separate visual effect, not a substitute for substantial parent volume. Save lineage and child IDs so reload cannot resurrect the destroyed parent.

## 6. Shard → body → render mapping

```text
StableShardID + generation
  -> ECS shard slot: persistent material/geometry/lineage/state
  -> optional BodyPool slot: Rapier body + collider handle(s)
       independent shard OR compound-island body + local shard transform
  -> RenderBinding: bucket ID + instance ID + geometry ID
  -> reverse collider / ray-hit binding: StableShardID + generation
```

For compounds, render each shard at island-body pose times its stored local shard transform. For independent bodies, render the interpolated previous/current physics pose. Ballistic/frozen states fill the same transform buffer. A body slot or instance index is never a save/network identity. Rapier handles remain Float64 transient values, matching Step 1, and can be reused by the engine.

Use InstancedMesh buckets for repeated geometry/material combinations: each shard template/material/LOD has one bucket with preallocated instance capacity. Use BatchedMesh geometry/instance IDs for unique Voronoi shapes. A single ordinary InstancedMesh cannot represent arbitrary unique shard meshes with different vertex layouts. Maintain forward and reverse bindings when compacting slots; update instance matrices once per dirty bucket, and ray hits resolve the exact logical shard. Retain the already-working unique-geometry batching path until its replacement passes identical native captures.

## Integration and acceptance stages

1. Global debris counters/admission policy around existing `PhysicsSystem` and `MasonryDamage`; preserve the current save format and body caps during migration.
2. Reusable body slots and rendering bindings in a isolated fixture; verify slot generations, mass reset, stale-event rejection and no steady-state JS allocation before using it in city combat.
3. Sleeping/frozen support dependencies and chunk persistence; prove wake-on-impact/support removal, floor collision and repeated reload without duplication.
4. Ballistic LOD with swept collision and hysteresis; walk back through the boundary, shoot distant debris, and compare cover/passability before and after promotion.
5. Authored fixed-joint assemblies and compound promotion; prove the actual installed reaction-measurement route before claiming physically measured stress cascades.
6. Transactional secondary fracture; verify mass, COM, momentum, body/hull caps and parent/child restoration.

Each runtime stage must pass build/typecheck, relevant regression checks, native WebGPU and WebGL2 gameplay, same-camera intact/damaged captures, floor/wake probes, actual disk save/reload and the packaged death-menu flow. Keep the last runnable checkpoint if a stage fails. No runtime code was changed to publish this design.

Sources: [Rapier rigid-body mass/inertia](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/), [joint behavior](https://rapier.rs/docs/user_guides/javascript/joints/), [contact-force events](https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection/), [sleep/wake behavior](https://rapier.rs/docs/user_guides/javascript/rigid_body_sleeping/), [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), [BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html). Installed API verification: `node_modules/@dimforge/rapier3d-compat/dist/dynamics/impulse_joint.d.ts`, `rigid_body.d.ts` and `geometry/collider.d.ts`.
