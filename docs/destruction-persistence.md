# Dark Rain — Step 7: destruction persistence and A-Life queries

Next subsystem: [Step 8 — performance gates, capability-preserving scaling and Electron profiling](destruction-performance-budgets.md).

## Status and persistence rule

Architecture contract for [Steps 1–3](destruction-joints.md), [debris](destruction-debris-manager.md), [tactical destruction/gravity](destruction-tactical-layer.md) and [audio](destruction-audio.md). No runtime code changes accompany this document. Current `SaveSystem` already serializes/restores physics through `SaveStorage`, the preload bridge and `SaveStore`. The main-process store validates slot names, serializes writes, writes/syncs a temporary JSON file, backs up the old file and renames the replacement. Full per-chunk ledgers, transactional world snapshots and the A-Life query service below remain proposed.

Persist irreversible gameplay changes and material disposition. Rebuild disposable representations and caches. **Settled gameplay debris persists. Airborne cosmetic particles do not. Airborne structural debris cannot simply be discarded:** save its pose/motion or an authoritative moving aggregate and resume gravity on load. Otherwise a mid-collapse save deletes material, changes cover and can invalidate support. This refines the suggested “mid-air debris doesn't” rule to preserve the physical world promised by Steps 4–5.

## 1. Identity, ownership and complete logical schema

All lengths are meters, masses kilograms, time fixed simulation ticks, quaternions normalized `(x,y,z,w)`. Use stable string IDs (or lossless encoded integer IDs) derived from world/asset identity and fracture lineage. Never persist Rapier handles, ECS pool indices, instance IDs, audio voices or GPU buffers as identity. `Pose` is a position plus rotation; shard geometry is COM-local. A chunk has a deterministic coordinate/key and declared bounds; its dimensions come from world configuration, not an assumed new grid.

The following is the **logical storage schema**, not executable component code. Optional fields apply only to the indicated representation. Named references must resolve in the same committed save generation or its immutable base assets.

```text
SaveManifest
  schemaVersion, gameName="Dark Rain", saveId, generationId
  worldId, worldSeed, generatorVersion, assetCatalogHash
  snapshotTick, worldTime, createdAtUtc, previousGenerationId?
  playerStateRef, factionStateRef, alifeStateRef
  chunks[]: {chunkKey, revision, blobHash, byteLength}
  dynamicIslandIndex[]: {islandId, ownerChunkKey, bounds, referencedChunks[]}
  payloadHash, migrationHistory[]

ChunkDestruction
  schemaVersion, worldId, chunkKey, bounds
  baseChunkHash, revision, snapshotTick, lastEventSequence
  structures[]: StructureDelta
  fractures[]: FractureRecord
  shards[]: ShardRecord
  islands[]: IslandRecord
  rubblePiles[]: RubblePileRecord
  attachments[]: AttachmentRecord
  materialLedger[]: {structureId, materialId, sourceMassKg,
                    remainingAttachedKg, looseKg, consolidatedKg,
                    cosmeticFinesKg, explicitlyRemovedKg}
  lastRelevantSimTick

StructureDelta
  structureId, authoredAssetId, authoredAssetHash, originPose
  tier: hero | standard
  graphRevision, topologyRevision, geometryRevision
  failedJointIds[]
  survivingJointDamage[]: {jointId, damage01, sustainedOverloadState?}
  removedShardIds[] (fractured/replaced/explicitly removed tombstones)
  damagedMembers[]: {memberId, retainedGeometryRef, remainingVolume,
                    damage01, aperturesRef, supportDependencyIds[]}
  collapse: {phase: stable | failing | falling | handingOff | settled,
             collapseEventId?, startTick?, variantId?, variantAssetHash?,
             variantSeed?, remainingSourceMaskRef?, coarseGroupIds[],
             swapGroups[]: {groupId, committed, commitTick?, rubblePileId?}}

FractureRecord
  fractureId, parentShardId, childShardIds[], algorithmVersion
  materialId, seed, geometryPayloadHash, hullRecipeVersion
  geometry: authored asset reference OR saved exact vertices/indices,
            cut-face/material attributes and volume/COM metadata
  externalJointRemap[], retainedInternalBonds[]

ShardRecord
  shardId, structureId, memberId, parentShardId?, fractureId?
  geometryRef, materialId, volumeM3, massKg, centerOfMassLocal,
  inertiaRecipeRef, ownerChunkKey
  mode: attached | moving | settled | consolidated | removed
  pose, supportIds[], islandId?, pileId?
  motion?: {linearVelocity, angularVelocity, lastPhysicsTick,
            representation: rigid | ballistic | compound,
            sleeping, gravityScale}
  removedReason?: fractured | collected | scriptedCleanup

IslandRecord
  islandId, ownerChunkKey, memberShardIds[], activeJointIds[]
  anchor/supportIds[], supported, representation
  bodyPose?, linearVelocity?, angularVelocity?
  shardLocalPoses[] (required for a moving compound)
  pendingFailureOrFractureOps[]: {operationId, causeId, affectedIds[],
                                geometryResultRef?, reservedDisposition}

RubblePileRecord
  pileId, structureId, variantId?, variantAssetHash?, seed?
  sourceShardIds[], representationRevision
  pose, retainedGeometryRef, collisionRecipeRef, materialLayersRef
  settled, supportIds[], remainingMassByMaterial[], damagedPatches[]
  looseChildShardIds[], consolidatedChildShardIds[]

AttachmentRecord
  objectId, objectStateRef, supportId?, localSupportPose?, worldPose
  mode: attached | resting | falling | collected
  linearVelocity?, angularVelocity?

FactionWorldState (referenced once by manifest, not copied per chunk)
  revision, factions[], strongholdIds[]
  territory[]: {regionId, controllingFactionId?, contested,
                effectiveTick, transitionEventId?, causeStructureIds[]}
  strongholds[]: {strongholdId, structureIds[], factionId?,
                 occupancyState, supplyState, objectiveState,
                 captureProgress, lastEvaluatedWorldRevision}
  processedDestructionEventCursor, pendingStrategicEffects[]
```

Failed bonds are irreversible absent explicit repair. Save partial bond damage too: storing failures alone would heal every nearly broken support. Pending operations are either committed before the snapshot barrier or represented as fully specified resumable work; never persist half-installed children or an invisible parent. A pending authoring/compute job may restart from a stable seed only if its algorithm/version and result are reproducible. Retain the intact visible/physical source while its result is not authoritative.

Authored shards reference immutable asset geometry. Runtime GPU fracture stores exact gameplay geometry/hulls or a demonstrably deterministic versioned CPU reconstruction recipe; a seed alone does not promise identical results across GPU/drivers. Derived hulls may be regenerated from exact geometry using the pinned recipe, with validation that it does not fill existing holes. Inertia is reconstructed consistently with Step 4. Unknown asset hashes require a migration or compatible legacy asset, not silently regenerating an intact building.

Structures have a stable home chunk; cross-chunk moving islands have **one authoritative owner** plus index references in other chunks. Pose changes crossing a boundary do not duplicate the body/save record. Ownership transfer is committed within one snapshot generation. A rubble pile and its consolidated shard records are alternative representations of the same mass: source members remain identifiable, but only the authoritative representation renders/collides. Loose children removed from a pile's retained geometry cannot also remain in its collision mesh. Material ledgers explicitly account for small cosmetic fines rather than claiming all rendered dust persists.

Do not save a free-standing `veilSwapped=true` and guess the rest. Persist each committed group swap together with source mask, destination pile and collapse phase. Dust opacity itself is disposable. Saving between partial swaps must restore exactly the groups already handed off and resume the remaining falling groups.

## 2. Electron save pipeline

```text
fixed-tick snapshot barrier
 -> consistent player + physics + destruction + faction/A-Life snapshot
 -> immutable dirty-chunk records + generation manifest
 -> bounded serialization/encoding
 -> narrow preload save request
 -> main-process validation / queued filesystem commit
 -> committed acknowledgement
 -> update save availability + clear only captured dirty revisions
```

1. At a fixed-step boundary, finish the currently committing topology/fracture transaction. Capture one `snapshotTick` across player, chunks, moving islands, loot and strategic state. Briefly pause mutations or use revisioned copy-on-write buffers; off-thread JSON serialization alone does not make a snapshot consistent. Resume simulation after capture. Changes after that tick remain dirty for the next save.
2. For the first implementation, extend the existing slot JSON with a versioned destruction section. Preserve its `meta.version` and backward-compatible migration path. Keep current recoverable writes while the chunk model is introduced; do not replace a working save system merely to obtain separate files. Autosaves and manual saves share a serialized per-slot commit policy and monotonically ordered generations.
3. If the changed world approaches the current 64 MiB JSON limit or profiling shows unacceptable copying, move to immutable chunk blobs plus manifests. Write each changed blob under a content hash inside an app-controlled slot directory; unchanged blobs can be referenced again. Bound payload sizes/counts before allocation. Main process resolves slot IDs only, never arbitrary renderer-supplied paths, and verifies its IPC sender as the current bridge already does. Expose specific write/load operations rather than unrestricted filesystem access.
4. Write new blobs to same-directory temporary files, flush/close them and rename to immutable names. Stage the new manifest, validate all referenced lengths/hashes, flush it, preserve the previous committed generation, then replace the slot's manifest pointer/manifest. Only a fully published manifest selects the new generation. A partially written set of blobs is not a valid save. Do not unlink the old manifest as a rename workaround; a failed replacement leaves the old generation intact.
5. Acknowledge success only after commit. Record captured chunk revisions; clear a dirty flag only if the current revision still matches the captured one. Reject out-of-order commit acknowledgements so an older autosave cannot overwrite a newer manual snapshot. Keep previous valid generations for recovery and garbage-collect unreferenced blobs only after commit and recovery retention checks. Disk-full/permission failures leave gameplay and the prior save available.

Same-volume rename is the publication mechanism, not a blanket power-loss guarantee for every Windows filesystem/device. Flush files and apply directory synchronization where supported; define recovery around validated manifests, retained generations and hashes. Do not claim universal crash durability just because an `fsync` call succeeded. Current JSON backup reads perform basic metadata validation, not this proposed full schema/hash validation.

## 3. Load, streaming and recovery

1. Select the newest **fully committed and validated** generation. Ignore temporary files/orphan blobs. Check schema, asset/generator compatibility, hashes, counts, references, finite numeric values, mass/volume validity and unit quaternions. Fall back to the previous valid generation on corruption and report recovery. Unknown future versions are not silently accepted. Migrate a copy; never destroy the original save while upgrading.
2. Build a staging world/session under the loader. Generate immutable base chunks from their pinned seed/version, then apply damage tombstones, failed joints and exact retained geometry **before** physics or actors become active. Recompute connectivity/unsupported islands with the preserved bond state. No original wall collider may survive alongside its breach replacement.
3. Restore attached supported regions, pile collision and grounded settled pieces. Instantiate each moving island/shard once with pose, velocities, mass and gravity; map stable IDs to fresh runtime handles. Validate saved support relations against restored geometry. A piece with missing/moving support wakes; do not snap it to terrain Y or freeze it simply because its save mode said settled. Rebuild contact warm starts instead of persisting Rapier's transient solver internals.
4. Restore loot/props/characters against the same generation. Attached objects follow their saved support; unsupported objects resume falling. Hydrate local resident physics within Step 4 limits, with safe coarse representations for moving excess material. Do not advance a collapse through arbitrary hidden catch-up steps during load or teleport final rubble over the player.
5. Rebuild cover candidates, exact local route tests, spatial indexes and acoustic occlusion from the restored geometry. Restore strategic faction ownership/capture state; recompute damaged-stronghold condition without applying old territory transitions twice. Audio resumes current loops but historical cracks/dust particles do not replay. Mid-collapse visual effects may restart a short local veil while moving geometry remains authoritative.
6. Publish the staging session only when collision, actor placement and critical local queries are ready. Repeated loads replace the prior session instead of appending bodies/instances/listeners. On failure, retain the previous session or return to a usable menu; never expose a half-restored black world.

Chunk eviction is not slot saving: resident physics/render caches can unload after their latest destruction records reach the session ledger. Dirty unloaded chunks remain eligible for the next disk snapshot. Re-entry restores that same ledger. Offscreen cosmetic debris ends; structural motion can remain as a coarse gravity/swept aggregate or advance via a recorded simplified simulation, with explicit `lastRelevantSimTick`. Never resolve an unoccupied aerial chunk by simply deleting its moving mass. Offline real-world time does not advance destruction unless a separately defined game rule requests it.

## 4. A-Life query API and examples

Provide a read-only revisioned world view, backed by resident exact geometry and unloaded chunk summaries. Query outputs contain `worldRevision`, per-chunk revisions, confidence (`exact`, `coarse`, `pending`) and validation tick. Coarse summaries are rebuilt caches keyed to authoritative records, not another mutable truth. A coarse clear route requires exact clearance validation before a nearby actor uses it. Occupancy/territory are simulation state, not inferred directly from a rubble mesh.

| Query | Inputs | Outputs |
|---|---|---|
| `queryRouteChanges` | region/route IDs, locomotion profile, revision cursor | Blocked/reopened links, rubble cause IDs, width/height, required clearance, hazards, changed cost and revision. |
| `queryCoverPositions` | bounds, actor profile, threat/weapon, faction, revision | Stable candidate IDs/poses, material protection, stability, accessibility, source rubble ID; delegate local evaluation/reservation to Step 5. |
| `queryStrongholdCondition` | stronghold ID, expected revision | Damaged entries/walls, usable occupied floors, safe capacity, supply/escape links, structural danger and owner reference. |
| `queryTerritoryChanges` | faction/region filter, strategic revision cursor | Actual ownership/contested transitions, reasons and causal destruction IDs; destruction alone may produce no change. |
| `queryDestructionSince` | bounds, sequence cursor, output capacity | Deduplicated irreversible changes and affected assets; overflow/compaction returns `resyncRequired` with snapshot revision. |
| `querySupportStatus` | object/support ID, revision | Supported/unsupported/unknown, supporting geometry revision, moving-support hazard; coarse uncertainty requests hydration. |

Examples (declarative calls, not implemented methods):

```text
queryRouteChanges(routeIds=["rail-yard-service-lane"],
  locomotion={capsuleRadius:0.35, height:1.8, maxStep:0.3}, since=842)
 -> link blocked by pile "warehouse-A:roof-rubble";
    alternate breach is pedestrian-only; revision 851, coarse

queryCoverPositions(bounds="garage-west-entrance",
  actor="standing-human", threat="street-east", weapon="rifle", faction="A")
 -> "garage:slab-17:face-2", crouch pose, concrete protection,
    grounded/stable, exact revision 851; reserve through Step 5 before moving

queryStrongholdCondition("warehouse-A", expectedRevision=842)
 -> roof wing unusable, rear breach traversable by small mutants,
    supply lane blocked, north wing remains usable, owner still faction A

queryTerritoryChanges(faction="A", region="rail-corridor", sinceStrategic=91)
 -> contested at tick 129400 after retreat/capture decision;
    cause "warehouse-A:collapse-3", transition ID "territory:92"
```

Territory changes require the strategic rules to evaluate surviving defenders, access, supplies, morale and capture objectives. A destroyed stronghold can remain owned, be abandoned or become contested; never automatically award it to whoever fired the final shot. Store processed event cursors and unique transition IDs to make resumed evaluation idempotent. Microdamage events can compact into chunk state; pending strategic consequences must remain recoverable after event-history compaction. AI learns local tactical changes through perception/communication rules, even though the simulation query service can describe the authoritative world.

## 5. Persist versus rebuild

| State | Rule |
|---|---|
| Failed bonds, partial damage, removed parents, exact breaches | Persist; do not heal/regenerate on load. |
| Settled meaningful debris and rubble patches | Persist geometry/asset reference, pose, material and support state; rebuild bodies/render bindings. |
| Moving meaningful shards/compounds | Persist pose, velocities, lineage and disposition; resume gravity, with bounded coarse representation if necessary. |
| Standard collapse phase/group swaps | Persist variant, seed, remaining source mask, committed swaps and moving group state. |
| Loot/corpses/furniture affected by support loss | Persist gameplay state and pose/support or motion, independent of cosmetic debris. |
| Ownership, contested state, capture progress and strategic cursors | Persist; do not reapply completed consequences. |
| Cosmetic airborne splinters, sparks, dust/smoke particles | Discard/rebuild from current phase if useful; no gameplay collision, damage or significant structural mass can depend on them. |
| Rapier handles, pool slots, solver/contact caches, rendering IDs | Rebuild from stable identities; never serialize as world truth. |
| Union-find, cover/nav indexes, acoustic caches | Rebuild; optional versioned hints only, rejected when geometry revision differs. |
| Audio one-shots / historical physics events | Discard; resume continuous current-state audio without replay. |

## 6. Acceptance gates

Extend current-save compatibility first. Tests must cover: a bullet breach; nearly broken surviving bonds; grounded rubble; airborne roof/slab; partially completed veil swaps; pending fracture admission; shelf loss with falling loot; cross-chunk moving islands; repeated load without duplicates; route/cover changes; and territory decisions applied exactly once. Compare material accounting, geometry, collision and revisioned queries before/after save.

Inject interrupted writes before each publication step, disk-full failure, corrupt blob/manifest, outdated assets, malformed quantities and overlapping autosave/manual requests. Recover the previous complete generation, never a mixed generation. Run native packaged WebGPU/WebGL2 load, menu/death recovery, mid-collapse save/reload and visible gravity checks. A filesystem unit test cannot prove the full game restores correctly, and this documentation checkpoint makes no such new claim.

References: [Electron's narrow preload/IPC request patterns](https://www.electronjs.org/docs/latest/tutorial/ipc), [Node filesystem operations and file synchronization](https://nodejs.org/api/fs.html). Current source foundation: `src/systems/SaveSystem.js`, `src/systems/SaveStorage.ts`, `src/preload/index.ts`, `src/main/index.ts`, `src/main/SaveStore.ts`.
