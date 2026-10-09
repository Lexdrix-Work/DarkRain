# Dark Rain — Step 9: multiplayer-ready destruction over WebTransport

Build order: [Step 10 — one-archetype vertical slice, observable gates and explicit cuts](destruction-vertical-slice.md).

## Status, scope and quality agreement

Architecture proposal following [persistence](destruction-persistence.md) and [performance/quality budgets](destruction-performance-budgets.md). No network runtime, server or multiplayer test was added with this document. Keep the playable single-player build while introducing replayable mutations and authority boundaries in isolated stages.

Use **deterministic scene mutations plus authoritative motion corrections**, not full-world transform replication or client-to-client physics lockstep. This matches the hybrid pattern described by Teardown's developer: reliable ordered destruction commands and unreliable moving-object state, with bounded late-join replay. Dark Rain's packet formats, limits and checkpoint recovery below are our proposed design, not copied Teardown internals. [Developer account](https://blog.voxagon.se/2026/03/13/teardown-multiplayer.html)

Latest user policy permits minor destruction-detail differences by quality, with Ultra offering maximum detail. In single player a chosen profile may set secondary fragment detail/body budgets. In multiplayer the **session/server selects one canonical gameplay destruction profile**; all clients agree on apertures, support failures, material/collider geometry and meaningful rubble. Ultra clients may add richer non-gameplay splinters, visual secondary fracture, dust and audio. A low-quality client cannot retain an intact wall that an Ultra client shot through, or omit a falling slab that can hit a player. If it cannot represent canonical gameplay collision at 60 fps, that session profile is unsupported on that hardware rather than silently diverging.

## 1. Authority and protocol channels

The authoritative server runs combat validation, structural failure decisions, active gameplay physics and strategic A-Life. A listen server can initially share the local authority implementation; a headless authority must eventually run without renderer/WebGPU/DOM/audio dependencies. WebTransport supplies a browser-to-server connection, not peer discovery, NAT hosting, matchmaking or a ready server. Design an HTTP/3/TLS endpoint and authentication separately. Feature-test secure-origin and certificate behavior inside the actual packaged Electron shell; `file:` origin behavior must be verified rather than presumed. Do not disable certificate checks as a shipping solution.

Start with one reliable ordered command stream per subscribed client, a small reliable control stream and separately framed snapshot/blob streams. WebTransport streams are ordered **within each stream**, not globally across them. All commands therefore carry authoritative sequence/revision dependencies. Datagram delivery may be lost, duplicated or reordered. Use reliability/size capability checks at connection setup; a reliable-only transport can carry replaceable latest-state messages on a separate stream with bounded backpressure, but cannot be assumed equally low latency.

| Lane | Direction/content | Required behavior |
|---|---|---|
| Control, reliable | Hello/version/assets, subscriptions, acknowledgements, resync, accepted/rejected actions | Length-framed messages, bounded sizes; never expose arbitrary server/filesystem operations. |
| Player requests, reliable or redundant sequenced input packets | Shot/explosion/tool intent with input ID/tick and weapon context | Server validates actor, ammunition, cadence, reach and historical hit context. Clients cannot submit an accepted joint failure or their chosen damage value. |
| Destruction transactions, reliable ordered | Resolved material operations, joint breaks/remaps, shard creation, collapse phase/swap, support and final-settle events | Apply once, in authoritative order at a transaction boundary. Preserve data under congestion or resync; never silently discard it. |
| Active motion, datagrams | Island/body pose, velocities, sleep/wake status, server tick and topology barrier | Replace old state with newer state; no topology or irreversible damage here. |
| Checkpoints/geometry, reliable bulk | Versioned chunk checkpoint or exceptional canonical geometry blob | Hash-verified bounded fragments; a command referencing an unavailable blob waits until its dependencies arrive. Control/command traffic takes priority. |

Handshake includes protocol/schema version, session/world epoch, world seed, immutable asset/generator/fracture hashes, Rapier build and fixed tick rate (60 Hz), canonical destruction profile, supported geometry codecs and datagram maximum size. Reject incompatible canonical asset/algorithm versions before joining; downloads must be completed/validated before their use. A reconnect uses a new connection ID with the same stable player identity and explicit resume cursor. Session restart changes the epoch, invalidating old packets and stale handles.

## 2. Command envelope and ordered application

Logical transaction schema (not executable code):

```text
DestructionTransaction
  protocolVersion, sessionEpoch, transactionId, serverTick
  globalSequence, causeInputId?, causeEventId
  affectedChunks[]: {chunkId, previousRevision, nextRevision}
  dependencies[]: {assetOrGeometryHash, requiredChunkRevision}
  operations[]:
    MaterialCut(targetId, expectedGeometryRevision, quantizedLocalShape,
                materialRuleId, depositedEnergyQ, fractureSeed, childIds[])
    JointDamage(jointId, canonicalDamageQ)
    JointBreak(jointId, failureMode, failedAtTick)
    JointRemap(jointId, oldShardId, newShardId, quantizedAnchorFrame)
    ShardCreate(shardId, parentId, geometryRecipeOrBlobHash, initialMotion)
    IslandReclassify(islandId, memberIds[], survivingBonds[], supportState)
    CollapsePhase(structureId, phase, variantId, seed, sourceMask)
    VeilGroupCommit(groupId, sourceMask, destinationPileId, pileRecipeHash)
    SupportChanged(objectId, supportId?, state)
    FinalSettle(shardOrIslandId, canonicalPose, supportIds[], poseRevision)
    MaterialRemove(id, reason) / OwnershipTransfer(id, fromChunk, toChunk)
  canonicalTopologyHash, materialLedgerDelta
```

Network IDs map stable saved IDs to compact integers through an acknowledged reliable dictionary; never reuse an ID within an epoch. Counts/byte lengths are explicit. Hash a canonical binary serialization of logical geometry/topology, not object-property insertion order or floating-point render buffers. Use deterministic rounding/unit conventions. Quantize local positions initially to 1 mm and energy/damage to documented fixed-point units; verify these resolutions against smallest supported material features. Whole-world positions use chunk origin plus bounded local coordinates to avoid overflow.

The server resolves **local-space damage and exact targets**. Clients do not raycast the same world-space bullet against their independently moving debris and assume the same hit. Server lag compensation must validate against historical relevant cover/destruction revisions, not only historical player capsules; never resurrect an old wall in the live simulation while checking a shot. Impact predictions can show temporary sparks/sound immediately, but irreversible geometry and joint removal commit only when confirmed. Full rollback of arbitrary debris is deferred until a separately tested prediction system exists.

Sort operations and generated IDs canonically; reserve all required data/slots before commit. Apply every operation in a transaction atomically between physics ticks, then publish cover/nav/audio events. A missing previous revision means request recovery, not applying the cut to a different shard. Duplicate transaction IDs/old sequences are harmless; a forward gap pauses affected-region mutations until recovered. Applying a command cannot generate another authoritative command on a client. The server alone emits secondary contact breaks and cascades; clients may predict motion but never decide new canonical fractures from divergent contacts.

Global sequence defines authority order, while per-chunk revision chains allow interest filtering. Include complete boundary transactions and dependencies when subscribing to a cross-chunk island. Do not mistake omitted unrelated global sequences for missing subscribed commands; subscription epochs/ranges specify the delivered projection. Ordered subscribed commands must still arrive on the single mutation stream. Concurrent hits on one wall are resolved by the server's fixed-tick/input order, not by worker completion order or packet arrival on different client streams.

## 3. Deterministic versus synchronized state

| Must reproduce identically from commands | Corrected/replicated by authority | Local-only presentation |
|---|---|---|
| Material removals, retained geometry, shard lineage/IDs | Active gameplay shard/island poses and velocities | Dust/sparks, visual splinters, audio variations |
| Joint damage/break/remap and connectivity | Player/actor interactions and collision outcomes | Noncolliding detailed fracture overlays |
| Breach apertures, canonical collision recipes | Ragdolls/props that influence gameplay | Render LOD, reflections/shadows, particle counts |
| Authored macro variant/committed swaps | Final grounded rubble pose/support changes | Cosmetic corpses only if explicitly non-gameplay |
| Saved material ledger and persistent destruction state | Territory/loot/health outcomes, outside destruction protocol | Camera sway, effect timing and screen composition |

Canonical fracture uses pinned integer/fixed-point material cuts and deterministic CPU geometry/voxel meshing or validated authored shard recipes. Specify PRNG, seed, sorting/tie-breaking, clipping/rounding, topology IDs and collider generation. GPU fracture is a visual accelerator unless its exact canonical output is proven identical; otherwise the server provides a versioned geometry exception blob/hash. Exceptional blobs are bounded recovery/asset data, not per-frame full-world mesh streaming. A seed alone cannot make driver-dependent floating-point compute deterministic.

Current `FractureGeometry.ts` uses floating-point clipping and `Math.sin/cos` warp; do not label that implementation cross-platform canonical merely because it has a seeded PRNG. Rapier's WASM determinism requires identical version, initial values, construction/removal order and inputs; its documentation specifically warns about initializing with cross-platform-varying transcendental operations. Client quality/interest differences violate identical-world assumptions, so we deliberately state-sync motion instead of requiring whole-physics lockstep. [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/)

Motion packet: epoch, packet sequence, server tick, dictionary version, required topology revisions, then independently decodable records `{bodyOrIslandId, poseRevision, quantizedPose, linvel, angvel, flags}`. Initial target <=64 bytes/record. Prefer absolute chunk-relative records first; deltas later require an explicitly acknowledged baseline. Never depend on receiving the previous datagram. Body introduction/wake/removal is reliable before state uses its ID. Buffer newer motion only briefly while waiting for its topology; reject stale epoch/generation/pose revisions.

Near critical bodies update at 20 Hz, mid-relevance at 10 Hz, distant moving at 2–5 Hz; server physics remains 60 Hz. Use per-client visibility, proximity, danger and age scheduling so low-priority active bodies are not starved indefinitely. Client presentation interpolates roughly 100 ms of remote motion and locally predicts where useful. Bound extrapolation to 150 ms, then mark uncertainty and avoid inventing local structural outcomes. Server authority remains definitive for hits/cover. Small corrections blend visual transforms; large/collision-critical corrections update authoritative collision immediately with safe depenetration and a short visual correction, not slowly sweeping an outdated collider through another player.

## 4. Sleep, settled rubble and join-in-progress

Active motion packets alone cannot reconstruct settled rubble: the commands that made a slab fall do not specify where it ultimately landed. Send a **reliable `FinalSettle`** with pose/support revision, then stop regular state packets. Wake sends a reliable phase change and resumes active state. Thus “state-sync active debris only” means no continuous static-world updates; it still needs one authoritative final pose and occasional correction/checkpoint. Persist that final pose via Step 7. Moving objects needed by a late join receive a current baseline, never hours of old velocity packets.

Join flow:

1. Authenticate, verify versions/assets and select subscribed chunks with a dependency halo for long-range fire and falling cross-chunk material. Pin an immutable checkpoint at sequence/tick S; begin capturing a reliable ordered tail after S while it transfers.
2. Rebuild pinned base assets and replay the checkpoint's compacted destruction state plus ordered commands after S in a staging scene. With a short log, replay directly from the base. With a long log, Step 7 chunk snapshots bound reconstruction time. Replay **scene mutations only**, not real-time physics for every historical tick and not old sounds/effects.
3. Receive an authority barrier at B, the active-body baseline for B and final settled poses as of B. Buffer motion/commands newer than B. Hash-verify geometry/topology and install collision exactly once. The checkpoint, tail and motion baseline must share an identified sequence cut, not three independently “latest” datasets.
4. Acknowledge B and required chunk revisions, apply queued tail/state in dependency order and enable the player's spawn/input only when nearby collision/cover is ready. Catch-up happens under a loader and bounded slices; it must not stall existing connected players.
5. On re-entry/resync, replace the affected chunk projection from checkpoint+tail rather than duplicating objects. Reconcile crossing islands and attachment IDs before publishing it. Check per-chunk topology hashes approximately every 2 seconds for dirty subscribed chunks; request targeted recovery on mismatch. Render-only differences do not enter that hash.

Interest radius starts around 150 m with a 50 m prefetch halo, but extend subscriptions for actual weapon range, visible threatening collapse bounds and remote interactions. Radius alone cannot exclude a wall a player can shoot. Maintain a lightweight topology summary for unloaded areas, and hydrate exact dependencies before local interaction. Server owns all gameplay outcomes in the region, regardless of what a client currently renders.

## 5. Initial buffer/bandwidth limits

These are Dark Rain prototype limits for an initial four-player session; validate them under the Step 8 collapse workload. They are not guaranteed WebTransport throughput or Teardown's numbers.

| Buffer/resource | Limit and overflow behavior |
|---|---|
| Datagram payload | min(1,200 bytes, negotiated `maxDatagramSize`); split independent records across packets, never fragment topology into lossy datagrams. |
| Input requests | 120 small intent envelopes/second/player with validated weapon cadence; 64 KiB bounded unprocessed queue. Rate-limited/rejected intents never become trusted damage. |
| Reliable transaction frame | <=64 KiB encoded; larger authoritative transaction uses a framed multi-part commit with <=4 MiB staging, explicit parts/hash and atomic final publication. |
| Unacknowledged reliable commands | <=2 MiB or 4,096 transactions/client. Above 1 MiB initiate checkpoint resync; retain truth on server and disconnect an unrecoverably slow client rather than drop commands. |
| Client apply queue | <=2 MiB or 4,096 transactions; gameplay apply work <=0.5 ms/frame inside the shared Step 8 budget. Sustained backlog/critical latency is a failing workload. |
| Motion receive/jitter history | <=512 KiB and 250 ms; latest record/source wins, at most two future-topology records/body. Expired replaceable packets may drop. |
| Datagrams awaiting topology | <=256 KiB /250 ms total; then request missing dependency/resync, not unbounded retention. |
| In-memory recent command log | <=16 MiB or 100,000 transactions, whichever first; checkpoint around 8 MiB/50,000 transactions and retain the previous complete checkpoint. |
| Join tail while loading | <=8 MiB /30 seconds; if exceeded, restart from a newer checkpoint, then fail join cleanly if replay cannot catch up. Never keep an unbounded lobby buffer. |
| Bulk/checkpoint transfer | <=64 KiB message fragments; <=4 MiB in-flight receive assembly; stream a larger validated checkpoint to staging storage rather than one huge JS allocation. |
| Geometry exception blob | <=4 MiB/asset, chunked/hashed and cached; exceeding this requires revised authoring/codec, not an unrestricted network allocation. |
| Destruction-only steady outbound | Target <=160 KiB/s/client: motion <=128 KiB/s plus commands/control <=32 KiB/s. At 96 bodies x64 B x20 Hz, motion alone is ~120 KiB/s. Other gameplay traffic is additional and must have a separately measured session budget. |
| Join bulk traffic | <=1 MiB/s/client token budget, subordinate to command/control/critical motion; availability depends on actual link. Cap simultaneous heavy joins at one initially. |

Count framing/dictionaries/retransmission and wire overhead separately. Token buckets reduce cosmetic/low-priority motion frequency under congestion, **not authoritative destruction events**. A burst of canonical cuts may exceed the steady target briefly within the bounded reliable queue; sustained overflow fails the network budget and needs codec/replay optimization. Ultra's higher moving-debris count may exceed the 96-body bandwidth example: prioritize relevance and measure the maximum correction age, without omitting damaging bodies. Compression uses bounded decompressed lengths; malformed IDs/ranges/references close the invalid session safely.

Checkpoint compaction replaces log history only after snapshot+tail recovery is committed and pinned joins release their references. A full replay-only buffer can explicitly disable join-in-progress until a new snapshot exists; never pretend truncating the log leaves a replayable scene. Preserve durable Step 7 state even if the recent network log is compacted. Replay and stream flow control must not block the server's physics tick or sound/network timers behind disk writes.

## 6. Constraints single player must respect now

1. Route irreversible mutations through a versioned, idempotent command/apply boundary. Single player uses a local authority calling the same path; multiplayer later adds validation and transport. Separate **requested action**, **resolved structural command** and **presentation event**.
2. Use stable IDs, deterministic lineage, seeded dedicated PRNGs, canonical sorted iteration and explicit units/revisions. Do not derive authority IDs or seeds from `Math.random`, Date/time, render FPS, array compaction, camera position or Rapier handles.
3. Separate canonical gameplay fracture/collision from GPU/render/audio detail. Pin recipes/assets, preserve exact canonical geometry, and create a replay hash fixture before claiming GPU commands are reproducible.
4. Fixed 60 Hz authoritative ticks decide material damage, support failures and secondary collision damage. Queue worker results by revision and authoritative application order, not arrival time. Client callbacks never author new fractures or territory outcomes.
5. Keep quality settings out of canonical authority decisions within a multiplayer session. Offline quality profiles can differ, but saves record their canonical profile; joining a session adopts its authority profile. Ultra presentation adds detail without additional client-only damaging collision.
6. Keep ECS/structural/physics authority usable without renderer, Electron UI or audio. Do not make server gameplay fracture require a WebGPU adapter; use the deterministic CPU/asset path. Local rendering services consume commands/results.
7. Save compatible chunk checkpoints, motion/final-settle state, sequence cursors, pending atomic operations and cross-chunk ownership. Use exactly-once strategic side effects; replay does not emit old gunshots or recapture territory.
8. Expose interest/dependency queries from Step 7, with affected bounds and support/attachment references. Stable mutation order includes spawn/remove/ownership and material changes, not just `JointBreak`.
9. Reserve prediction for reversible visuals initially. Plan ID remapping, acknowledgement/rejection and history boundaries before predicting physical holes or locally removing a support.
10. Add offline multi-instance replay comparisons and network fault fixtures before integration: same commands across CPU architectures/backends/quality levels; packet loss/reordering/duplicates; concurrent shots; mid-collapse join/reconnect; stale motion after secondary fracture; corrupted asset hash; slow-client recovery; command compaction while a join is pinned. Verify identical topology/cover and bounded motion correction, plus packaged boot/death/save flows.

Implementation must remain staged and runnable. Passing offline command replay is necessary but does not establish multiplayer physics correctness, transport connectivity or 60 fps under network load.

Transport references: [WebTransport reliable streams and datagrams](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport), [datagram sizing and queues](https://developer.mozilla.org/en-US/docs/Web/API/WebTransportDatagramDuplexStream). Source inspection: current `FractureGeometry.ts` and `JointConnectivity.ts`; neither is declared multiplayer-canonical by this design.
