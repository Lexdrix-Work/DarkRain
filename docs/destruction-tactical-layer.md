# Dark Rain — Step 5: tactical destruction and gravity contract

Next subsystem: [Step 6 — procedural stress, break, collapse and debris audio](destruction-audio.md).

## Status and governing rules

Architecture proposal built on [Steps 1–3](destruction-joints.md) and [Step 4](destruction-debris-manager.md). This document does not implement a tactical cover service, authored collapse transitions, navigation rebuilds or universal support-aware gravity. The current physics world already uses gravity `(0, -9.81, 0)`; that does not make its fixed city colliders react dynamically to lost support. The hero/veil split below is Dark Rain's proposed design, not a verified account of Bad Company 2's internal implementation.

Both tiers accept damage at the hit point with the same material rules. Tier changes macro simulation cost, not whether a wall can be breached. Geometry and collision decide holes, bullet protection and traversal. Effects do not erase material, restore broken supports or make AI see through opaque dust. Architecture remains separate from implementation until each stage passes native play and save/load checks.

```text
Bullet / blast / impact
  -> material penetration + Steps 1–3 damage/fracture/connectivity
  -> authoritative geometry/collision revision
  -> local cover degradation + opening / support-loss events
       -> hero: Step 4 moving islands, contacts, settling
       -> standard: prepared collapse sequence + gravity-aware proxies
  -> cover index / sightline queries / local navigation updates
  -> faction tactics + actor perception + A-Life route changes
  -> persistent rubble cover and destruction ledger
```

## 1. Micro-destruction state machine

State is per cover patch/member, not one health bar for a whole building. Store `coverId`, `structureId`, material layers, local bounds, geometry revision, remaining section, breach apertures, support state, motion state and saved fracture lineage. States are monotonic absent an explicit reconstruction system:

```text
INTACT -> CHIPPED -> HOLED -> DESTROYED
   |          |         |
   +----------+---------+--> DESTROYED (sufficient single impact/collapse)
```

| State | Geometric condition | Tactical consequence |
|---|---|---|
| Intact | No detached material or connected through-opening | Material and thickness still determine whether it stops the selected ammunition. |
| Chipped | Material lost; no connected through-opening | Cover becomes thinner/weaker locally; the damaged point may admit a bullet without admitting an actor. |
| Holed | A connected through-opening exists while some patch material remains | Exact muzzle/eye rays can pass through the opening; traversal requires sufficient swept body clearance. |
| Destroyed | No attached barrier remains in this patch | The original cover is gone; moving or settled fragments are separate potential cover. |

Do not enter `Holed` at an arbitrary HP percentage. Compute aperture topology from the retained fracture/voxel geometry; use conservative collision until exact replacement is ready. A wall can be destroyed while its rubble still blocks a route. An intact thin sheet may be penetrable; a holed wall may still protect the actor outside the aperture. Keep `supported/unsupported`, `stable/moving/settled` and `macroPhase` orthogonal to these states.

Penetration resolves ordered material intersections along the actual trajectory. For each layer, deduct calibrated resistance based on thickness, incidence, projectile type and material; retain energy and direction for subsequent layers and actors. Ricochet depends on impact angle/material. An existing opening has no wall resistance. Damage uses energy deposited in each struck layer, not the full projectile energy repeatedly. Concrete may chip under rifle fire long before penetration; plaster, glass and wood behave differently. Numbers require fixture calibration, not a universal bullet count. Use the same query for AI prediction and player bullets.

Every authoritative revision emits a bounded event: `CoverChanged(id, revision, dirtyBounds, oldState, newState, apertures, supportState)` and, when appropriate, `BreachChanged`, `CollapseStarted`, `DebrisSettled` or `SupportLost`. Aggregate events per affected patch/physics step. Collision changes, cover invalidation and hazard publication commit together; clients never keep invisible intact cover until a later AI refresh.

## 2. Macro tier selection

Assign a stable authored tier per building or structurally bounded subassembly. HERO is required when gameplay depends on arbitrary partial collapse: occupied multi-floor objectives, bridges/parking decks, repeatedly attacked strongholds, moving heavy cover, or structures whose failures must alter adjacent load paths. The structure must also fit the Step 4 body/hull/joint budgets using connected compound islands. Do not silently change an active hero into an authored collapse because the player looks away.

STANDARD uses the veil tier when it is a repeatable background or ordinary low-rise structure with a validated finite set of collapse paths, rubble footprints and entry/interior configurations. It retains micro-fracture everywhere, but macro outcomes come from authored variants selected by failed support groups and surviving sections, not generic total HP. Standard assets need separate partial-wing and whole-building outcomes where warranted. If no valid outcome exists for a support failure, hold the surviving supported part and release the unsupported part through a coarse gravity/contact proxy; never leave unsupported geometry fixed merely because an animation is missing.

Choose tiers at asset compile/world generation, persist tier and collapse variant seed, and reserve simulation capacity before admitting a hero assembly. A budget-overflowing important building needs subdivision or an affordable compound representation. Distance may change debris LOD, but not damage rules or tier mid-event. This limits city-scale expense while preserving the player's ability to chip any exposed material; equal affordances do not imply exact structural simulation everywhere.

## 3. Standard-tier veil transition, precisely

Each asset supplies: support-group trigger predicates; stable remaining sections; 2–4 example directional/partial variants where suitable; gravity-consistent coarse falling masses and swept collision envelopes; a rubble mesh with matching convex collision; rubble material-volume accounting; loot/support attachments; dust emitter paths; acoustic cues; and cover/navigation candidates. Counts are authoring defaults, not engine limits.

1. **Prepare before failure.** Stream likely variants and reserve debris/effect slots before the collapse can trigger. Cache the current damage mask. Select the variant from failed supports, damage direction and stable seed. Exclude already detached material and retain already-created debris, loot and surviving walls. Rubble volume accounts for remaining source material, including porous packing; do not duplicate a complete pristine building into its rubble.
2. **Commit failure at a fixed tick.** Publish `CollapseStarted`, invalidate unsafe cover, wake dependent objects, and establish the moving collision proxies. Emit dust from fractures/contacts and creaks from the structure. A genuinely unsupported piece begins falling immediately; warning sound is not a timer that holds it in the air. Roof movement and the coarse silhouette give a readable escape opportunity only while supported structure permits it.
3. **Move before masking.** Coarse slabs/wall groups fall and rotate under gravity/contact constraints toward a compatible rubble footprint. Near actors get Rapier collision and contact-driven consequences; distant unoccupied groups may use swept gravity trajectories. Any authored interpolation must follow a validated collision-safe trajectory and yield to actor/contact constraints. No invisible kill-volume that kills everyone in the building and no teleporting occupied floors.
4. **Build the veil.** GPU dust billboards/local density fill the falling footprint, with depth-tested soft intersections and wind. Author a matching CPU density volume for AI transmittance. GPU dust is an optical layer, not collision or structural authority. Budget a local screen-coverage/transmittance check at the intended seam; smoke behind the building does not hide its front. Aim for roughly 1–3 seconds of heavy local dust as a tuning starting point, then fade according to conditions. Persistent world-distance fog is unnecessary.
5. **Swap only a safe seam.** Require a coarse group to reach a matching rubble pose, with no actor or important loose object interpenetrating the new geometry. Swap that group's render and collision representations at the same physics boundary; unregister the source first within the transaction and register the replacement without duplicate mass/contact. If dust sufficiently obscures the seam, a hard visual swap is acceptable. If the seam is visible, wind clears dust, effects are disabled, an observer is inside, or the GPU coverage result is unavailable, keep the coarse moving representation and finish a visible pose-matched transition. Do not stall physics or remove material waiting for opacity. Structural leftovers stay visible outside the dust.
6. **Reveal usable rubble.** Publish cover from grounded rubble faces and navigation after the relevant local geometry settles. Loose slabs remain movable/secondary-breakable; an authored rubble mound still has breakable material patches and support dependencies. Freeze only grounded stable portions. Let dust decay while fine debris lands, with collision-synchronized sound. Save phases, seed, remaining geometry, group poses, debris lineage and ledger revisions; loading mid-collapse resumes instead of rerunning the trigger or resurrecting walls.

The concealment is thus falling motion + localized dust + synchronized collision + pose-matched rubble. It is not a guarantee that nobody can tell: first-person interiors, clear weather, disabled effects and multiple observers must work when concealment fails. Future networking replicates authoritative trigger/tick, damage mask, variant and gameplay proxies; client dust seeds may vary without changing bullet protection.

## 4. Gravity applies to every gameplay-relevant unsupported object

Use world gravity in meters/seconds: `(0, -9.81, 0)` for loose solids. Bodies may sleep while genuinely supported; removing their support wakes them. Record support dependencies for rubble, loot, furniture, roofs, hanging props and corpses. A foundation/terrain is a world anchor; ordinary architecture has an explicit supported path to it. Breakable support is not an eternal fixed-body exemption.

Near loose solids use Rapier mass/inertia and contacts. Mid-field debris uses the same acceleration with finite-size sweeps. Far-field freezing requires stable contact/support, never merely leaving the screen. Unsupported macro geometry retains a moving coarse representation at saturation. Shelved inventory pickups acquire gravity when the shelf fails; attached equipment follows its wearer until detached; dropped guns and ragdolls fall and collide. Kinematic living characters explicitly integrate vertical velocity, grounded tests and collision-constrained movement; being kinematic does not automatically grant gravity. Vines/clothing can use cheaper anchored sag/secondary motion, not thousands of rigid bodies. Dust uses settling, drag and wind; buoyant smoke uses an appropriate buoyancy model rather than stone-like free fall.

On generation/load, validate contact/support rather than silently using a flat terrain Y everywhere. Interiors, bridges, stairs and rubble can be the support. Cached sleepers/static rubble retain support IDs and wake when those supports move or disappear. Reserve actor/ragdoll/essential-object physics capacity independently of cosmetic debris. Sleeping and distant approximations are optimizations of grounded objects, never authorization for floating geometry.

Rapier distinguishes dynamic bodies, which respond to forces, from fixed and user-driven kinematic bodies; this distinction is why setting world gravity alone cannot satisfy this rule. See [Rapier rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/).

## 5. AI cover-query contract (interface design, not code)

All queries use stable IDs + world/geometry revisions and caller-owned result buffers. Index cover patches, breach apertures and rubble in spatial cells. Narrow-phase rays/sweeps test the same current colliders/material intervals as combat. Coarse states accelerate rejection but cannot substitute for geometry.

| Operation | Inputs | Returned information |
|---|---|---|
| `queryCover` | actor position/body profile, threat positions, weapon profiles, radius, team, tick, output buffer | Stable cover ID/revision, stand/crouch poses, protected fraction, penetration risk, peek positions, reachability, support/hazard stability, occupancy and score. |
| `evaluateCover` | cover ID + expected revision, actor pose, threat/weapon, tick | Valid/stale/unsafe status, exposed silhouette samples, predicted ballistic protection, collapse risk and reason. |
| `traceFireLane` | muzzle, target, projectile profile, tick | Ordered hit materials/thickness, remaining energy, clear/penetrable/blocked path; sight visibility separately includes dust transmittance. |
| `queryBreach` | bounds, actor capsule/locomotion profile, tick, output buffer | Aperture dimensions, body clearance, floor support, step/drop constraints, destination connectivity, moving-debris risk and revision. |
| `reserveCover` / `releaseCover` | cover ID/revision, actor/faction ID, expiry tick | Reservation token or conflict; invalidated immediately when cover becomes unsafe. |
| `subscribeChanges` | spatial region or registered cover IDs, revision cursor | Deduplicated cover/breach/collapse/support events since the cursor, with a resync marker if bounded history overflowed. |

Cover score balances protection, exposure on approach, usable firing angle, distance, collapse risk, team spacing and objective value. Reserve positions rather than sending a whole faction to one slab. Revalidate before arrival and before committing to a peek; stale query results cannot authorize shooting through a newly moved chunk. Dust may conceal vision but does not stop bullets; a bulletproof face can still fail to hide the actor's head.

Local events invalidate only overlapping cover/navigation cells. Immediate invalidation and hazard flags are cheap; prioritize nearby fighting actors, then batch expensive candidate rebuilding. Suggested target: 0.5–1 ms per render frame for queued tactical work, measured independently of Step 4 physics. Navigation opening requires a capsule sweep and valid landing support, not only a ray-sized hole. Runtime rubble may close a previously open link. If work is pending, the old invalid cover is unusable and the changed route is conservatively blocked until validated. No full-city per-frame navigation rebuild.

Nearby squads react on perception/shared-radio information: loss of cover -> suppress from surviving cover, flank, withdraw or reposition according to morale and objectives. They do not instantly know hidden enemy positions. Mutants use breach links suited to their own body size/locomotion; crawling and jumping require matching animations and support checks. Offscreen A-Life updates its coarse route graph and local danger cost from the persistent event, without creating physics for every distant actor. Returning actors hydrate against current rubble and cannot spawn inside yesterday's wall.

## 6. Three outcome-changing fights

**Atlanta storefront ambush — micro.** A faction rifleman controls a street from behind masonry. Repeated hits in one area chip it; a later through-hole opens a low firing lane. The defender's selected cover is invalidated only where their body is now exposed, prompting a move to the remaining pier. Thin interior drywall is penetrable while that concrete pier still protects. The attacker can force displacement and cross the street; firing elsewhere would not create the same lane. Chips fall onto the shop floor, and only a larger body-clear breach becomes a flanking route.

**Parking garage standoff — hero macro.** Attackers destroy a critical column supporting a compromised deck. Steps 2+4 identify the unsupported island, which falls under gravity; contact loads and cached support demand may trigger neighboring failure. The defending squad abandons its unsafe elevated firing line. A ramp slab lands across the original route, while grounded concrete creates new cover below. The attack can succeed by removing elevation but can also destroy the attackers' own approach. This is a fixture-dependent cascade, not a guarantee that every single column collapses every garage.

**Rail-corridor safehouse — standard macro plus A-Life.** A squad holds a low-rise warehouse. Damage to designated support groups initiates a compatible roof/wing collapse variant. Coarse roof masses fall, dust temporarily conceals the doorway, and survivors retreat to the intact wing. After settling, a broken wall aperture and safe floor link let small mutants flank; larger mutants remain blocked. Rubble shelters an advancing faction patrol but obstructs its old vehicle route. The player's exploit changes faction routing and ownership pressure after the fight, rather than merely producing an explosion effect.

## 7. Integration gates

1. Instrument existing cover geometry and material penetration; verify intact/chipped/holed/destroyed rays against actual visible holes. Preserve current game boot and combat.
2. Add support-dependent loot/props/rubble wake and character falling fixtures. Remove shelf/floor supports and verify falling, collisions and save/reload without duplication or floating.
3. Add the local cover index, event invalidation and one squad repositioning fixture; test reservations, stale revisions, dust perception and narrow-vs-body-sized breaches.
4. Ship one hero garage fixture using Step 4 admission and support rules; measure saturation, gravity, falling floors and rescue/retreat routes.
5. Ship one standard warehouse asset with interior observers, no-dust mode, wind-cleared seams and mid-collapse reload; prove no material/collision disappearance and continuing micro-breakability of rubble.
6. Hook local navigation and coarse A-Life route changes to saved events; verify revisit behavior and corpse/loot support after collapse.

Every runtime stage requires appropriate tests, build/typecheck, native WebGPU and WebGL2 play, packaged menu/death recovery and disk save/load. Compare the same camera before damage, during falling and after settling. Current architecture publication changes no runtime and makes no new performance or playable-feature claims.
