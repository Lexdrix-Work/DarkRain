# Dark Rain — structural stress and fracture

The [practical joint revision](destruction-joints.md) supersedes the continuous solver direction below. The original schemas and examples remain useful; current implementation and deferred work are recorded there.

## Status and authority

This is the design contract for Steps 1–3, together with an implementation record. All values use SI units. Strengths are tunable gameplay approximations, not certified engineering properties. CPU structural state and Rapier own gameplay; GPU detail must never determine whether a player can pass through a hole.

Implemented: typed graph compiler, CSR adjacency, ECS arrays, two compiled example buildings, incremental gravity/load-path solver, connection failure, procedural-building adapter, irregular planar Voronoi wall pieces, matching physical debris, batched rubble, exact fragment geometry in saves, and legacy fracture-save restoration.

Remaining: full six-degree-of-freedom stress equilibrium; anisotropic/material-specific fracture geometry beyond masonry; hierarchical pre-fracture asset tooling; runtime GPU volumetric fracture and mesh extraction; connected rigid islands; network replication. Existing procedural buildings are converted from their wall sections, not yet authored beam/column/slab assets. The solver's load-path ranks are a graph approximation, not a finite-element simulation. The GPU pipeline below is a design, not a claim that it already ships.

## System connection diagram

```text
Author mesh / procedural building
  -> member + port + material compiler
  -> immutable structural graph + pre-fracture hierarchy
  -> ECS mutable member/connection state

Bullet / explosion / falling-body contact
  -> authoritative impact event (ID, revision, position, energy, material)
  -> material damage + fracture request
  -> changed cross-sections / broken joints
  -> dirty load-path graph
  -> incremental stress solver
  -> overloaded joints / members / unsupported islands
  -> repeated redistribution until stable or budget exhausted
  -> detach structural islands
  -> Rapier bodies + collision geometry
  -> impacts may schedule secondary damage
  -> sleeping grounded debris -> persistent rubble collider + batched render

Fracture request
  +-> pre-authored material hierarchy -> appropriate detail
  +-> bounded WebGPU fracture job -> classify / extract / read back
  +-> CPU fallback / authority validation
       -> interior surfaces + chunks + collision shapes

Event stream -> synchronized audio/dust -> journaled save / future replication
```

## Step 1 — structural graph model

The complete executable definitions are `src/systems/destruction/StructuralGraph.ts`. Authoring data uses stable string IDs; runtime indices are derived by stable ID ordering. An ID remains stable across damage and save restoration; an ECS generation prevents a reused slot accepting an old impact.

| Record | Complete fields |
|---|---|
| Building | id, revision, members[], joints[], supports[] |
| Material | id, densityKgM3, youngPa, poisson, compressivePa, tensilePa, shearPa, fractureEnergyJm2; optional grainAxis and transverseYoungPa |
| Member | id, kind beam/wall/column/slab, material, building-local positionM, quaternion rotation, dimensionsM, optional volumeM3/massKg/centerOfMassLocalM, section, ports[], optional reinforcement and renderRef/collisionRef/fractureRef |
| Section | areaM2, iyM4, izM4, torsional jM4, spanAxisLocal |
| Port | id, member-local positionLocalM, normalLocal, tangentLocal, contactAreaM2, allowedJoints[] |
| Reinforcement | steelAreaM2, yieldPa, embedLengthM, bondPerimeterM, bondPa |
| Joint | id, kind, endpoint member+port for A/B, normalStiffnessNm, tangentStiffnessNm, rotationStiffnessNmRad, compressionCapacityN, tensionCapacityN, shearCapacityN, momentCapacityNm, friction, preloadN, separationToleranceM; optional boltGroup and reinforcement |
| Bolt group | count, diameterM, yieldPa, patternLocalM[] |
| World support | id, member, port, supportVolumeId, resting/embedded, areaM2, friction, constrainedDofs bitmask, contactToleranceM |
| Compiled member | author fields plus index, computed volume/mass/local inertia tensor and material strengths |
| Compiled joint | author fields plus index, nodeA/nodeB, connectionPointM, load-transfer behavior |
| Graph | format darkrain-structure, schemaVersion 1, id/revision, SI units, local Y-up coordinates, referenced materials, nodes, edges, supports, CSR adjacency offsets/edgeIndices |

The compiler validates duplicate IDs, member dimensions/rotation, endpoints and joint compatibility, contact positions, nonnegative capacities/stiffnesses, and world support references. It computes volume, mass and box inertia unless authoring overrides volume/mass. Accurate non-box inertia and effective sections belong in the future authoring exporter. Adjacency construction is O(V+E), with stable ordering costing O(V log V + E log E).

ECS uses structure-of-arrays components:

```text
StructuralMember:
  generation:uint32, kind:uint8, material:uint16
  mass, volume, remainingVolume:float64
  compression, tension, shear:float64 (Pa)
  position:float64[3], rotation:float64[4], inertia:float64[6]
  damage:float32, alive:uint8
StructuralConnection:
  a,b:uint32, kind:uint8
  normalK,tangentK,rotationK:float64
  compression,tension,shear,moment:float64
  damage:float32, normalForce,shearForce,momentDemand:float64
  active:uint8
GraphTopology: adjacencyOffsets:uint32[], adjacencyEdges:uint32[]
StructuralRuntime: rank:int32[], loadN/utilization:float64[], dirty queue,
  outgoing load per support, reverse dependents, active world supports
Sparse bindings: stable IDs, connection ports, world support references,
  render/collision/fracture references
```

Welded joints transfer normal/shear forces and moments until yielding/fracture. Bolted joints transfer through bolt-group capacities, can slip and then tear out. Embedded joints transfer via concrete bond/rebar development; bond failure can leave a steel tie. Resting contacts carry compression only, friction-limited shear, no bonded moment or tension, and separate when unloaded. These are target constitutive behaviors; the present gravity solver applies force capacities and resting shear, without bolt slip hysteresis or explicit rebar ties.

At build time: assign members and material regions -> compute effective sections/mass -> author explicit connection ports -> discover candidate contacts with a spatial index -> approve/load-type those contacts -> associate foundations with destructible terrain/support volumes -> compile stable IDs and CSR -> validate grounded connectivity and undamaged loading -> serialize graph and fracture asset references. Do not weld two objects merely because their meshes touch. A world support is not an immortal anchor: removing its support volume invalidates it.

### Worked wooden shack

Compiled asset: `src/data/structures/wooden-shack.json` (14 nodes, 20 edges, four supports). Source: `GraphExamples.ts`.

```text
roof (plywood slab)
  | two bolted nail/fastener groups
rafter0, rafter1 (wood beams)
  | four bolted rim connections
rimN, rimS, rimW, rimE
  | eight bolted corner connections
post0, post1, post2, post3
  | four embedded footing bindings
terrain support volumes

wallN -> post0,post1
wallS -> post2,post3
wallW -> post0,post2   (six bolted connections total)
```

Footprint 3.6×2.8 m, four .15×2.4×.15 m posts; two 3.6 m rafters; .06 m plywood roof; .018 m plywood walls. Wood density 550 kg/m³, plywood 600 kg/m³. Wood compression/tension/shear defaults: 30/70/7 MPa. Wood grain is member-local and should follow each authored beam's axis; the example material default is only a starting point. A missing post can be bridged by rims and walls, until their fasteners or bending capacity fail; losing one post does not mandate collapse.

### Worked concrete parking garage

Compiled asset: `src/data/structures/parking-garage.json` (18 nodes, 28 edges, four supports).

```text
slab1 -> beam1N/S/W/E -> column1_0/1/2/3
                              | four embedded column continuations
slab0 -> beam0N/S/W/E -> column0_0/1/2/3 -> foundations
```

Two 3 m stories over a 6×6 m bay; eight .45×3×.45 m columns, eight .4×.6×6 m beams, two 6.6×.3×6.6 m slabs. Each slab has four beam contacts; each beam has two column contacts; four column continuation joints connect the stories. Reinforced concrete density 2450 kg/m³, concrete compression/tension/shear 30/2.5/3.5 MPa. Rebar is separate: .004 m² steel area at 450 MPa yield, .7 m embed length, .3 m bond perimeter at 2 MPa bond. Concrete does not inherit steel tensile strength. This small gravity example lacks authored lateral bracing and vehicle load placement; it is not a complete garage engineering model.

Regenerate both examples with `node scripts/compile-structures.ts` using Node 24 or later.

## Step 2 — stress solver

### Algorithm

Use **incremental support-DAG load accumulation**, with rooted connectivity and local failure relaxation. Connectivity rank is distance from surviving world supports. Directed support links decrease rank, so gravity accumulation has no directed cycles even when the physical connection graph does. Prefer physically lower bearing contacts, then authored hangers/bracing; same-level rank links approximate lateral transfer. The current compatibility adapter uses rank plus vertical position, so detailed tension/hanger classification is a follow-up.

Load is a force: `F = remainingMass × 9.81 + externalForce + incomingLoads`. Never compare kilograms directly with pascals. Split loads by surviving effective support stiffness, not by arbitrary equal shares. Evaluate member stress and joint utilization separately: a connection can fail while both connected members remain intact.

```text
ON_DAMAGE(event):
  validate entity generation, topology revision and event ID
  update remaining section, mass, crack damage and affected joint capacities
  if a member/joint/support was severed:
    R = old reverse dependents of affected endpoints
    retain boundary ranks from unaffected grounded paths
    recompute connectivity/support ranks inside R
    reclassify supports and reverse dependents inside R
  enqueue changed members and the loads that depend on them

SOLVE_SLICE(deadline):
  while dirty work remains and time remains:
    n = highest support-rank dirty member, stable ID tie-break
    remove its previous outgoing reactions from affected supports
    if dead(n): outgoing(n) = empty; enqueue former supports; continue
    F = own remaining mass*g + external load + incoming reactions
    if no path to ground:
      mark detached; enqueue its reverse dependents; continue
    S = surviving eligible bearing/hanger contacts
    solve approximate reaction weights from effective stiffness in S
    distribute F; enqueue supports whose reactions changed
    evaluate compression, tension, shear, bending and connection demand
    for every overloaded joint:
      deactivate joint; invalidate local connectivity; enqueue reroute
    if member failure criterion is reached:
      mark failed; invalidate local connectivity; enqueue redistribution
    detach disconnected islands once their support decision is committed
  publish one ordered failure batch; keep unfinished work for next frame

ON_DETACH(island):
  remove static support collision in the committed physics tick
  create body from actual remaining geometry, mass, COM and inertia
  preserve motion; apply the triggering impact impulse
  body contacts can create new local damage events
  settle only after real support contact, then retain persistent rubble
```

The current code uses cached incoming/outgoing forces and revisits supports whose reactions change; it does not rebuild the whole graph every frame. Physical failures are batched into the existing debris queue. A procedural graph is compiled lazily on its first damage, then reused. Comparing changed health and locating dynamic loads still scans that affected building; those compatibility scans are not the final event-indexed ECS implementation.

### Failure criteria

| Material | Member failure test | Consequence |
|---|---|---|
| Wood | compression/buckling; grain-parallel tension; weak transverse tension and joint shear | splitting, pulled fasteners, residual hinge before separation |
| Concrete | tensile cracking and shear first; compression crush at high demand | lost stiffness, aggregate chunks, exposed rebar |
| Reinforced concrete | cracked concrete + yielded steel/bond capacity; reduced effective section | progressive hinge, bond loss, then detached section |
| Steel | yield/plastic hinge, buckling and accumulated tear damage | bends before separating; weld/bolt failure can dominate |
| Brick/mortar | mortar tension/shear and unit compression | units separate along courses; remaining arch/load path can survive |
| Plywood/drywall | panel bending, delamination, fastener pull-through | skin fails without automatically destroying studs |

Target member utilization uses axial normal stress `N/A ± My/Zy ± Mz/Zz`, shear `V/A_eff`, local compression and buckling. For resting contacts: `N>=0`, `|T|<=μ(N+preload)`, no tension. Joint capacities depend on damaged area, bolt count, bond length and reinforcement. Plastic/hysteretic state avoids an unstable on/off hinge. The current implementation covers remaining-area compression, approximate beam/slab bending, stiffness-weighted gravity, joint normal/shear limits, reinforcement-limited bending, support loss and redistribution. Full buckling, torsion, plastic history and six-axis reactions remain planned.

### Complexity and frame budget

Let V/E be one building, D the dirty members and E_D the edges in their affected region.

* Initial grounded graph: O(V+E), with stable ordering/sorting as noted above.
* Local connectivity: O(V_D+E_D), plus ordering of boundary seeds.
* A load slice: O(D log D + Σ degree(n)²) in the present code because contact lookup scans adjacency. Cached contact indices and a heap can reduce it to O(E_D+D log D).
* Memory: O(V+E), plus retained geometry and per-contact loads.
* Cascade: O(K(V_D+E_D+D log D)) over K failure revisions. Worst case D=V and E_D=E: a whole-building collapse genuinely changes the whole building. "Incremental" cannot make that case constant-time or forbid a full affected-building traversal.

Target at 60 fps (16.67 ms total): structural load work **1.5 ms CPU/frame**, dirty topology **0.5 ms**, fracture scheduling/authority **0.5 ms**, Rapier **2–3 ms** under configured active-body limits; asynchronous GPU fracture target **≤1 ms GPU**, measured separately because CPU/GPU work overlaps. These are allocations, not measured guarantees. Current load stepping has a 1.5 ms shared soft budget; sorting, first graph compilation, connectivity edits and collider rebuilds can exceed it. Chunking those into resumable jobs is required before calling it a hard bound. Physical collider creation and debris spawning need their own queue rather than hiding their cost in the solver.

### Surgical demolition walkthrough

Use a deliberately vulnerable two-column bay, not a guarantee that every missing column collapses a reinforced building. Initial upper-bay load 120 kN. Columns A/B each carry 60 kN and have 90 kN effective capacity; two beam contacts initially share the load.

1. Bullet/persistent local impacts chip A. Capacity and remaining mass change only around the breach. Load stays grounded while its cross-section still carries 60 kN.
2. The final section cuts A. Commit `alive(A)=0`, remove its load-transfer contacts, and invalidate its supported bay. The adjacent unaffected bay keeps its cached forces.
3. Connectivity finds a path through B. Nothing teleports or disappears; the beam still renders and collides while its support state is resolved.
4. Re-solve the carried slab/beam first. Its entire 120 kN reaction shifts to B. B has utilization `120/90=1.33`; joint shear/bending can fail before the column itself.
5. Deactivate the overloaded member or connection. Recompute only that dependent region. With no surviving grounded path, the slab, beam and remaining upper frame become a detached island.
6. The target island is converted to one or a few connected Rapier bodies, preserving mass/COM/inertia. Current procedural sections instead detach through the bounded per-section queue; connected-island bodies are still planned.
7. Falling geometry collides with lower floors/terrain. Contact impulses produce new damage events. A lower floor may survive, or fail if its new load exceeds its capacity; that decision is another incremental solve, not a scripted collapse.
8. Secondary fracture reveals fresh material. Grounded sleeping debris becomes persistent batched rubble with real collision. Unsupported suspended debris stays dynamic; body-budget pressure queues work rather than erasing it.

A robust garage can bridge A's loss. With B capacity 180 kN and adequate beam/joint bending, this scenario stops at redistribution, which is the correct result.

## Step 3 — fracture generation

### Path A: pre-fracture authoring

**Material-guided Voronoi clipping with hierarchical convex decomposition**:

1. Author watertight structural solids and layer boundaries: exterior finish, brick/mortar, concrete/rebar, studs/drywall. Establish material coordinates and grain directions.
2. Create coarse structural pieces, then nested detail pieces inside each parent. Child volumes must tile the parent without gaps or overlap. Store cut-plane adjacency and bond strength.
3. Seed patterns by material: elongated cells along wood grain, irregular concrete cells, radial/edge-biased glass, sheet-plane tears, mortar-course brick contacts. Ordinary isotropic Voronoi alone does not produce believable wood, brick or metal.
4. Clip against the original solid; retain surface UVs, add distinct interior materials, aggregate/wood cross-section and exposed reinforcement.
5. Build convex collider proxies, mass/COM/inertia, shared-face bonds, stable piece IDs and asset revision. Validate conservation and collision against the visual breach.
6. Bake detail tiers: near 24–64 rendered pieces, mid 8–20, far 3–8. Keep authoritative hole geometry and structural connectivity the same at every tier. A camera-distance switch must never replace a passable breach with intact collision. Fine cosmetic splinters can be GPU-only; substantive fragments carry mass.
7. Apply representative impacts, record intact/local breach/cascade/settled/reloaded states, compare fixed-camera captures and collision probes. Reject floating fragments, interior texture stretching, volume loss or pristine blocks appearing on impact.

Current masonry uses 18 fitted planar Voronoi cells per wall section, shared warped boundaries, fresh-cut face attributes and four-piece secondary fracture. It is a useful transition from box subdivision, not the full volumetric/material catalog or nested pre-fracture pipeline.

### Path B: runtime WebGPU compute

**Bounded anisotropic Voronoi partition + sparse solid field + dual contouring**. A compute dispatch cannot simply manufacture JavaScript `BufferGeometry` objects: outputs are buffers, counts and indirect draw parameters. Mesh creation/collider handoff is a separate stage.

```text
impact event + current topology revision
  -> clamp impact region within material solid and map into member space
  -> authority creates deterministic/quantized sites, planes, grain metric
  -> upload sites, solid/SDF or occupancy, material boundaries, damage energy
  -> dispatch 1: classify active voxels by weighted nearest site
       distance = (point-site)^T materialMetric (point-site)
       clip against original solid; record fracture interfaces
  -> dispatch 2: flag fracture faces / connected labels / cut-surface samples
  -> dispatch 3: prefix sums reserve bounded vertex/index ranges
  -> dispatch 4: dual contour boundaries; preserve hard material discontinuities
       output position/normal/UV/material/fractureFace, piece ranges, AABBs
  -> dispatch 5: optional reduction of volume, center-of-mass, inertia
  -> generation/revision check; discard stale result, never damage twice
  -> render GPU buffers or construct/update compatible mesh ranges
  -> asynchronously read back compact coarse piece data for CPU validation
  -> construct convex hulls / split nonconvex bodies into compounds in Rapier
  -> atomic swap of retained solid, render fragments, collision and graph
  -> structural dirty event; spawn debris with preserved mass and velocity
```

Start with small impact-local tiles (e.g. 24³–48³ samples), never voxelize all Atlanta per bullet. Keep fixed output capacities, an overflow flag and a lower-detail retry. A local GPU job can take multiple frames; until collision geometry is ready, preserve the old authoritative solid with a crack visual. Do not show an open hole that physics still treats as a wall. Cache fracture jobs by member/revision/site descriptor; prioritize near interactive damage. Further impacts on pending geometry coalesce or follow revision ordering.

A WebGL/fallback path must use the same canonical sites and material rules through CPU clipping. GPU field results can differ in floating-point rounding; quantized authority geometry or explicit replicated fracture topology prevents collision divergence. Cross-platform determinism requires fixed versions, initialization and operation order; a seed alone is insufficient if generation uses floating-point trig.

### Material fracture parameter catalog

Values below are initial art/gameplay settings and need visual calibration. Material strength is in the structural material catalog; these parameters determine fracture appearance and decomposition.

| Material | Seed pattern / anisotropy | Near / mid / far rendered pieces | Typical detail size | Bond/fracture behavior | Debris and cut surface |
|---|---|---|---|---|---|
| Wood | grain-aligned elongated Voronoi, 6–12:1 length bias; weak transverse planes | 24–48 / 10–16 / 3–6 | 2–8 cm splinters; 20–80 cm strips | split across weak transverse directions; leave hinges/fibers before separation | longitudinal fibers, pale end-grain, coarse structural strips plus cosmetic splinters |
| Concrete | jittered 3D Voronoi, 1–2:1 bias, rough shared facets | 32–64 / 12–20 / 4–8 | 5–30 cm chunks | low tensile energy (~120 J/m² baseline); compression crushing; bond and rebar retain pieces | dusty aggregate-rich interior; chipped edges, irregular weighty chunks |
| Glass | impact-radial sites + concentric density bands, thin planar cells | 32–64 / 12–20 / 4–8 | 1–12 cm shards | brittle low-energy crack network; glazing edge bonds; laminated glass needs a separate retained layer | thin sharp shards, restrained opacity, intact panes retain reflections; supported edge remnants |
| Sheet metal | 2D sites/tear graph, rolling-direction bias 2–4:1 | 16–32 / 6–12 / 2–4 | 10–60 cm bent panels | plastic deformation and accumulated tear energy before separation; bolts/welds can fail first | curled edges/bent panels, exposed bright torn rim; no powder-like breakup |
| Drywall | studs separate from board; planar small-cell fracture | 24–48 / 8–16 / 3–6 | 3–20 cm flakes; finer visual powder | weak gypsum with paper tension/delamination; fastener pull-through | chalky gypsum, torn paper, dust; studs remain structural after skin removal |
| Brick | mortar-course adjacency + rare fractured units | 24–64 / 12–24 / 4–8 | actual authored brick dimensions, ~20×6×10 cm | weak mortar bonds; preserve individual bricks until impact energy breaks them | exposed mortar and irregular brick surfaces; masonry courses survive outside breach |

LOD counts are visual goals, not a global limit or a substitution rule for gameplay collision. Fine dust can expire; substantive building mass remains as bodies, aggregates or saved rubble. Resting rubble can form new support/load paths in the final graph model; current grounded rubble is physical collision, not yet promoted into structural graph supports.

## Top technical risks

1. **Connectivity and reactions:** support rank can misrepresent lateral transfer, cantilevers and alternate paths. Validate deliberate demolition fixtures before expanding the model; move to a small local six-axis solver for ambiguous regions.
2. **CPU/GPU geometry mismatch:** async fracture, changing revisions and collider rebuild latency can create invisible walls or holes. Atomic authority swaps and shared canonical fracture data are required.
3. **Collapse spikes:** topology edits, hull creation, debris contacts and shadows can exceed 16.67 ms together. Budget each separately, retain unprocessed visible mass and aggregate connected islands.
4. **Material appearance:** generic Voronoi and tiled surface maps produce concrete-looking wood or blocky masonry. Author layers, grain, mortar and fresh-cut surfaces; compare against real material damage.
5. **Persistence/replication size and determinism:** raw triangle snapshots grow rapidly. Current exact geometry saves trade size for correctness. Introduce versioned shared geometry dictionaries, quantized canonical descriptors and immutable event IDs before large-scale collapse/network play.

## References and implementation boundaries

The gameplay references establish desired behavior; this is an original Dark Rain design. [Rapier rigid-body documentation](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/) describes the physical body integration; [Rapier determinism documentation](https://rapier.rs/docs/user_guides/javascript/determinism/) states its cross-platform conditions. [Teardown's official modding documentation](https://teardowngame.com/modding/) is a reference for voxel-based destructible content. These do not establish that Dark Rain already reproduces any reference game's physics.

