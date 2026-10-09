# Dark Rain — practical joint destruction revision

Next subsystem: [Step 4 — Rapier debris manager, pooling, LOD and persistent rubble](destruction-debris-manager.md).

New runtime work: [October 8 playable jointed-building fixture, landing fracture and saves](destruction-runtime-checkpoint.md). The generated city remains on the compatibility path below; the opt-in fixture now exercises actual fixed joints.

This revision supersedes the continuous-stress direction in [the original design](destruction-architecture.md). Keep physical chipping, material-aware fractures, event-driven damage, grounded connectivity and persistent rubble. Do not voxelize the whole city or simulate thousands of fully dynamic fixed-joint shards while idle.

## What ships in this checkpoint

Typed graph/ECS definitions, compiled shack/garage examples, actual convex-hull descriptors, local irregular masonry fracture, real debris collision, persistent geometry, union-find checks on graph changes, Rapier contact-force events and cached support-load checks triggered by damage/contact events. Render passes refresh on explicit draws. Support-load work is queued only while dirty, with no idle solve. Existing procedural buildings still use static section colliders and create bodies on detachment: this is a compatibility stage, not a completed per-shard fixed-joint city conversion.

Physical fixed-joint shard assemblies, connected compound island bodies, material-specific pre-fracture assets, hero-prop GPU voxel meshing and full material fracture geometry remain implementation steps. Keep them behind isolated fixtures until native gameplay and save restoration pass. The numeric joint profiles are prototype tuning defaults, not validated structural ratings.

## Step 1 — graph, bodies and connection limits

Full executable schema: `src/systems/destruction/StructuralGraph.ts`. Nodes carry stable IDs, member kind/material, mass/volume/COM/inertia, compressive/tensile/shear strengths, transform, effective section and connection ports. The compiled node adds `body.shardId`, initial fixed state and convex-hull vertices in member-local meters. Authoring may supply `hullVerticesLocalM`; the simple example compiler supplies the eight box corners. Nonconvex authored pieces must be split into convex shards, not approximated with a hull that fills a door opening.

Connections carry endpoint IDs/ports, weld/bolt/rest/embedded type, local anchor frames, stiffness and force/moment capacities. Optional `breakLimits` separates peak force N, event impulse Ns, fracture energy J, and sustained force N. Runtime state adds damage fraction, active flag, current island and body/collider/joint handles. Rapier handles are stored as Float64 values, not truncated into Uint32 entity IDs. Stable saved IDs never depend on those ephemeral physics handles.

```text
StructuralMember: stable member/shard ID, generation, kind, material,
  transform, volume/mass/COM/inertia, effective section, strengths, ports
ShardPhysics: hull asset, bodyHandle:f64, colliderHandle:f64,
  mode:u8 (static/active/sleeping), island:u32
StructuralJoint: A/B, port frames, type, area/fastener/bond parameters,
  normal/tangent/rotation stiffness, compression/tension/shear/moment limits
JointDamage: irreversible damage, event peak/impulse/energy limits,
  sustained overload state, active:u8, jointHandle:f64
GraphTopology: CSR offsets/edge indices, stable member/joint IDs
WorldSupport: destructible terrain/support volume binding, contact area,
  unilateral resting or bonded embedded support; not an immortal anchor
```

**Resting is not a fixed joint.** Fixed joints lock all relative motion, including separation and rotation. Resting material uses real unilateral contact/friction. Bolted/welded/embedded bonds may use breakable fixed joints as a practical approximation while intact. Treat intact islands as static or sleeping until needed; activate an affected assembly only when physical reactions are needed. Disable self-contact only for directly bonded neighbors, not for all debris in the same building.

Prototype limits per small connection group:

| Material pair / bond | Peak tension N | Shear N | Event impulse Ns | Fracture energy J |
|---|---:|---:|---:|---:|
| Wood nailed to wood | 1,200 | 900 | 18 | 35 |
| Wood bolted to wood | 12,000 | 8,000 | 90 | 250 |
| Steel anchor bolted to concrete | 40,000 | 25,000 | 250 | 900 |
| Steel welded to steel | 150,000 | 90,000 | 600 | 4,000 |
| Concrete embedded in reinforced concrete | 180,000 | 90,000 | 650 | 2,200 |
| Brick joined by mortar to brick | 1,500 | 1,000 | 20 | 25 |
| Glass fixed in steel frame | 400 | 300 | 5 | 8 |
| Drywall screwed to wood | 250 | 180 | 4 | 5 |

Scale force capacities by actual weld throat/bond area, fastener count, embed depth and damage; scale energy by crack area. Do not multiply the whole table by an arbitrary shard-size ratio. Steel-to-concrete tension is the minimum of steel yield, concrete breakout and anchor pullout. Concrete-to-concrete tension comes from concrete bond plus separately authored rebar, not concrete compressive strength. A peak or shear limit should be selected according to the event's direction at the connection frame.

Build-time workflow: author structural layers and member IDs -> material-guided pre-fracture -> clip watertight convex pieces -> compute volume/mass/COM/inertia -> preserve finish UVs and create fresh-cut surfaces -> author shared-face/fastener anchors and capacities -> build shard adjacency/CSR -> bind ground supports -> validate no overlapping hulls or initial unsupported islands -> serialize immutable hull/mesh assets plus versioned graph. Load the immutable graph and mutable damage state separately.

Worked graphs remain in `src/data/structures`:

```text
WOODEN SHACK: 14 coarse nodes, 20 bonds, four ground supports
roof -> rafter0/1 -> rimN/S/W/E -> post0/1/2/3 -> ground
wallN -> post0/1; wallS -> post2/3; wallW -> post0/2

CONCRETE GARAGE: 18 coarse nodes, 28 bonds, four ground supports
slab1 -> beam1N/S/W/E -> column1_0/1/2/3
                          -> column0_0/1/2/3 -> foundations
slab0 -> beam0N/S/W/E -> column0_0/1/2/3
```

Those are coarse member graphs and convex-body descriptors. A production pre-fracture asset expands each member into shard nodes, keeps `parentMemberId`, replaces each coarse bond with shared-face/fastener shard bonds, and records hierarchy/LOD. They are not yet imported Blender destruction meshes.

## Step 2 — event damage and connectivity

Rapier's contact-force events are **collision** forces; they do not expose reactions inside fixed joints. Fixed-to-fixed bodies also do not produce a meaningful live gravity reaction. Therefore use collision events for impacts and a cached support-load check after topology/carried-load changes. Full joint reactions would require an engine extension or a separate local estimator; do not claim contact events supply them.

Damage rules:

* Bullet/explosion: one deduplicated event ID applies spatially weighted impulse/energy to nearby bonds and material cross-sections. Apply each event once; read direction in the connection frame.
* Collision: integrate contact force over the physics step to get impulse; estimate dissipated energy from relative motion/effective mass. Route it to nearby bonds rather than damaging every bond equally. Filter insignificant events with Rapier's contact-force threshold.
* Safe static loading: never sum force forever. A healthy wall under gravity must not eventually explode. Recompute cached support demand after support removal, a carried-body contact/load change, damage or repair.
* Sustained overload: schedule an expiry/check only while demand exceeds the damaged capacity. Fatigue integrates **excess utilization × elapsed time**; cancel when demand falls below the safe band. No idle scan is required.
* Use separate force/impulse/energy limits. A prototype irreversible damage law is `D += .25 * max(0, max(F/F_limit, J/J_limit, E/E_limit)-.35)^2`, capped at 1. Repeated weak impacts below the dead zone do not age every building. Material calibration may replace this curve.
* On failure, remove the physical joint if instantiated, deactivate its logical bond, increment topology revision, and queue connectivity once for the batch. Removing one joint does **not** imply both endpoints are disconnected.

Union-find after deletions:

```text
ON_JOINT_REMOVAL_BATCH(building, removedEdges):
  mark removed edges inactive; remove matching Rapier joints
  parent[v] = v; size[v] = 1 for surviving shards
  for each surviving bonded edge (a,b):
    UNION(a,b) using union by size and path compression
  for each valid grounded support v:
    groundedRoots.add(FIND(v))
  for each surviving shard v:
    islands[FIND(v)].append(v)
  for each island:
    if root not in groundedRoots and island not already detached:
      commit detachment, retaining all geometry and mass
      create/activate the bounded physical assembly
      keep surviving internal joints, or use a compound body until it fractures
  queue support-load reevaluation only for changed grounded paths
```

Union-find cannot remove an edge from its previous union result. Rebuild the affected previous island (or the one affected building for the first implementation) after deletion. Complexity O((V+E) α(V)), memory O(V); initialization and grouping also cost O(V). Worst-case deletion splits a whole building, so processing all of that affected building is legitimate. No world-wide pass, and no graph pass while idle.

Target event budget: queue topology work with a **1–2 ms CPU slice**, avoid repeated rebuilds for an explosion's hundreds of broken edges, and let large jobs span frames. Physics still steps every tick; event-driven structural work does not make Rapier free. Hull/body creation and visual swaps need separate budgets. Current union-find and compatibility compilation are synchronous event jobs with a shared 1.5 ms soft support-work budget; this is not yet a guaranteed hard time bound. Use resumable union jobs before expanding to giant buildings.

Surgical demolition: chip a ground column -> sever its load-transfer bonds -> union-find checks whether the slab/frame still reaches another support -> if yes, retain the island and update only its cached load distribution -> overload a surviving beam/bolt/column if demand exceeds capacity -> remove that failed bond and run the next batched connectivity event -> a now-groundless upper island activates and falls -> real contacts impact lower floors -> collision impulse/changed carried mass create subsequent damage events -> independent islands settle as physical rubble. If the other supports can carry the load, the collapse stops. Do not force a scripted full collapse from every single-column loss.

The current compatibility implementation retains the incremental gravity estimator for dirty support checks, adds union-find for committed connectivity changes, and uses actual contact-force events for physical impact/load changes. It has not replaced every city section with an instantiated fixed joint.

## Step 3 — fracture, only where useful

Pre-fracture the ordinary city geometry. Hero doors, barricades and close cover may use a small dense field; arbitrary city-wide GPU fracture is deferred until the simpler path is visually and physically stable.

```text
impact ID/revision + member-local point + energy
  -> choose pre-authored fracture depth OR bounded hero-prop field
  -> canonical quantized sites/material metric; upload remaining solid
  -> compute classify voxel ownership / remove damaged material
  -> identify shared fracture faces and surviving solid connectivity
  -> greedy mesh exposed voxel faces, merging only matching material/normal
  -> preserve rough cut boundaries; output mesh ranges and overflow flag
  -> async compact readback for coarse convex collider geometry / piece IDs
  -> CPU authority validates revision, mass and connectivity
  -> remove affected old joints; atomically replace parent geometry/collision
  -> add shard nodes and shared-face joints; union-find connectivity event
  -> activate detached islands; secondary impacts may fracture again
```

Greedy meshing reduces voxel surface triangles but does not eliminate the voxel staircase. Use sufficiently small near-field voxels and material cut surfaces; ordinary masonry should use real fracture polygons rather than being turned into visible cube piles. Compute outputs buffers, not JavaScript meshes; counts/ranges and collider readback are explicit handoffs. Keep old collision until the new authoritative breach is ready. On WebGL2, use CPU clipping/pre-fracture with identical passability.

| Material | Pattern | Near / middle / far rendered detail | Useful behavior |
|---|---|---|---|
| Wood | elongated Voronoi 6–12:1 along grain | 24–48 / 10–16 / 3–6 | split along fibers, reveal end grain; fasteners can retain a hinge |
| Concrete | irregular 3D cells and aggregate cuts | 32–64 / 12–20 / 4–8 | weighty chunks, weaker tension, rebar bonds retained separately |
| Glass | radial thin planar shards, impact-biased sites | 32–64 / 12–20 / 4–8 | supported edge remnants, thin reflective shards, distinct laminated variant |
| Sheet metal | planar tear graph with plastic bend | 16–32 / 6–12 / 2–4 | bend/tear or lose bolts before detaching; no concrete-like powder breakup |
| Drywall | layered paper/gypsum panels | 24–48 / 8–16 / 3–6 | chalk flakes and cosmetic dust; skin can fail while studs remain |
| Brick | mortar-course bond graph | 24–64 / 12–24 / 4–8 | mostly whole bricks separating along mortar, occasional fractured bricks |

LOD changes cosmetic subdivision, not the authoritative hole or support graph. Keep substantial debris mass; only cosmetic dust/splinters may expire. Current masonry produces fitted irregular planar pieces with persistent hull collision and fresh-cut face shading; the rest of this material catalog is a design target.

## Acceptance gate for every stage

Build/typecheck -> relevant tests -> native launch/main menu -> actual New Game/loading -> fixed-camera intact/breach/collapse capture -> collision and debris-floor probes -> save/reload geometry and pending collapse state -> packaged executable launch. Keep the last runnable checkpoint until the next one passes. Record actual backend, errors, first-world load time and limitations. A compile or a still screenshot alone is insufficient to claim full-game correctness or 60 fps.

8 October checkpoint: all 92 tests and strict converted-module typechecking passed. The packaged WebGPU audit reached the menu in 3.8 seconds and the first world in 43.8 seconds from launch. The forced WebGL2 audit reached the world in 22 seconds including its initial backend reload. Both captured a visible local breach, produced persistent debris, restored identical debris counts from a real disk save and returned from death to the menu. These are observed launch measurements, not frame-rate or full-playthrough proof. Fresh chipped hulls use a 10 percent collision clearance with unchanged visual geometry and mass to avoid wedging in matching cut faces. Collapse can still leave large sections hanging or stacked like walls; complete fixed-joint assemblies, material fracture assets, AAA art quality and 60 FPS remain unfinished.

Sources: [Rapier contact-force events](https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection/), [Rapier joints](https://rapier.rs/docs/user_guides/javascript/joints/). The design borrows desired gameplay qualities, not a verified reconstruction of a proprietary game's implementation.

