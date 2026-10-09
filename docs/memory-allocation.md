# Dark Rain — Step 4 memory and allocation discipline

## Budget contract

All numbers below are MiB. These are working-set/admission targets to validate against named hardware, not measured certification or Chromium limits. The controller currently inventories geometry buffers, estimates referenced textures, measures available Electron process RAM, counts procedural sound buffers and tracks save-index strings. It does not yet enforce every category through a central allocator.

| Category | Low | Medium | High | Ultra |
|---|---:|---:|---:|---:|
| Entire app private-RAM target | 1024 | 1536 | 2048 | 3072 |
| GPU resident textures | 256 | 512 | 1024 | 2048 |
| GPU geometry allocation target | 128 | 192 | 256 | 512 |
| GPU render targets / shadows / reflections | 96 | 160 | 256 | 384 |
| GPU effects / compute / upload scratch | 32 | 64 | 128 | 256 |
| GPU working allocation envelope | 512 | 928 | 1664 | 3200 |
| CPU decoded/source assets and geometry | 192 | 288 | 384 | 512 |
| CPU simulation / physics working data | 64 | 96 | 128 | 192 |
| CPU decoded audio | 32 | 48 | 64 | 96 |
| CPU save/checkpoint staging | 64 | 96 | 128 | 192 |
| CPU workers / transient upload staging | 64 | 96 | 128 | 192 |
| CPU other game state / UI / JS | 256 | 384 | 512 | 768 |
| CPU Chromium / shell allowance | 256 | 384 | 512 | 768 |
| CPU reserve inside private-RAM target | 96 | 144 | 192 | 352 |

Keep at least 25–30% headroom against measured available graphics memory. An integrated GPU shares system RAM; CPU and GPU envelopes cannot simply be added to process metrics without accounting for overlap. Allocation estimates cannot prove available VRAM. Resource limits such as WebGPU maximum buffer size are not free-memory measurements.

The inventory runs every five seconds, in cooperative slices of up to 64 scene nodes / 0.20 ms admission target. Individual material inspection is not preemptible. It deduplicates geometry buffers and texture objects, includes exposed bodycam render targets and reflection textures, and labels GPU texture sizes as estimates. Hidden driver caches, internal TSL render targets, some batching resources and WASM allocation capacity are not fully accounted for by the scene inventory.

## Pooling and allocation patterns

| Subsystem | Pattern and status |
|---|---|
| ECS entities | Fixed slots plus generation counters; reset all component fields, publish activation only after initialization, reject stale handles. `SlotPool` now supplies this primitive. Legacy object-based gameplay entities have not all migrated to typed component pools. |
| Debris / generic rigid bodies | Recycle up to 32 disabled Rapier shells within the same world. Remove old colliders; reset pose, velocity, forces and torque; install new collider/mass; recompute mass properties. Reject stale record removal. Joint-attached bodies are removed instead of pooled. Shapes, fracture geometry and event records still allocate during bounded creation transactions. |
| Actor colliders | Recycle up to 32 disabled kinematic shells, resetting capsule shape and position when reused. Pressure trims idle shells; active collision remains. |
| Impact / explosion particles | Two packed preallocated banks, no new geometry or private animation loops per burst. Position/color/velocity/age/alpha buffers are reused. Expiry swaps the final live particle into the vacated slot. Saturation suppresses cosmetic particles, never damage. |
| Temporary math | Physics reuses actor positions, body translation/orientation and contact normal scratch objects. Rapier's supported output parameters populate those objects. Persistent consumers must copy scratch results. Other legacy loops still need allocation profiling. |
| Streaming | Reuse planning entries and priority arrays rather than rebuilding map/filter results each frame. Load/unload transactions remain cold allocation points. |
| Audio | Reuse decoded buffers; pool controllable voice wrappers. WebAudio source nodes are single-use and must be replaced when replaying; never pretend all audio nodes can be recycled. Existing audio pools remain, with decoded-buffer accounting added. |
| Save state | Desktop renderer keeps only slot metadata. Read a full save on demand for load/export, then let the temporary string/object graph release. Menu checks stay synchronous on the metadata index. Browser fallback retains its prior full-save behavior. |

Particle capacities (impact / explosion) are Low 256/512, Medium 256/1024, High 512/2048, Ultra 1024/4096. These bank limits are not a new total cap for every existing blood, dust, smoke and weather system. All existing effect classes still require shared admission integration.

The no-allocation rule applies to warmed steady-state hot paths. Pool construction, entity activation, asset loading and checkpoint creation are explicitly bounded cold work. A whole-game zero-allocation audit is not complete. V8, Three.js and Rapier may also allocate internally; profiling must distinguish application allocations from runtime allocations.

## Texture residency and KTX2/Basis

Implemented: a ref-counted texture registry with byte admission, pinned assets, least-recently-used eviction of unreferenced textures, KTX2Loader with two transcoding workers, packaged Basis transcoder resources, PNG fallback, and maximum source dimensions of 512/1024/2048/4096 by tier. The three shipped surface maps are pinned and share their loaded source. The existing PNG art is still shipped; it has not been converted to Basis assets.

Structural cells now share procedural map/normal/bump masters. Their physical tile dimensions already reside in cell UV attributes, so per-building texture objects no longer need duplicate uploads to express tiling. Texture clones that need different non-cell tiling still follow the existing authored-material path.

Asset-build workflow: generate KTX2/Basis variants with full mip chains at 512, 1024, 2048 and optionally 4096; preserve sRGB base-color metadata and linear normal/roughness data; provide stable manifest IDs and compressed residency estimates. Build-time encoder integration and authored compressed variants remain required.

Runtime flow: request a coarse variant first -> check byte headroom -> fetch/transcode off-thread -> stage upload -> bind replacement at a safe frame boundary -> release the previous variant once no material references it. Pin current weapons, nearby characters and minimum world surface representations. Predictive prefetch is lowest priority.

Three.js KTX2Loader supplies transcoding, not a complete sparse virtual-texturing system. This registry currently loads complete variants; a live coarse-to-fine material swap scheduler still needs integration. Changing texture LOD bias does not free allocated mip levels. Avoid claiming individual-mip memory eviction unless the backing allocation is actually replaced. See [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html).

## Geometry and save-state discipline

Instance compatible objects, batch static compatible geometry, retain shared material/texture ownership, and track vertex/index/instance buffer bytes rather than only mesh count. Dispose retired GPU bindings without disposing shared geometry still referenced by another chunk. Collider hulls need their own residency ledger; rendering LOD cannot remove required gameplay collision.

Target per-chunk state: stable authoring/seed revision, changed member IDs and health, failed connections, settled rubble transforms/recipes, loot/entity/faction deltas and revision checks. Aim for 64–256 KiB typical chunk deltas, with an explicit larger-chunk limit established through tests, plus a bounded queue of dirty chunks. Save templates/recipe IDs instead of duplicating unchanged authored meshes.

That compact chunk ledger is still future integration. Current destruction saves preserve exact geometry and compatibility; the new metadata cache eliminates permanent copies of every full JSON file in the renderer, but JSON serialization and full-world restore still have transient allocations. Existing writes retain temp-file sync, replacement and backup recovery. Never truncate a save or discard changed destruction to fit a budget.

## Pressure and out-of-memory behavior

1. Stop decorative prefetch and shorten woodland residency to the near-interest band. Existing terrain, roads, buildings and collision stay resident. Decoration may look sparser farther away.
2. Evict unreferenced texture entries; trim disabled physics/actor shells. Pinned/current assets and active bodies survive. WASM logical frees do not guarantee its linear-memory pages shrink.
3. Clear cosmetic pooled particles. Gameplay damage, projectile collision, structural failures and persistent rubble remain unchanged. Reflections/render-target resizing and audio-cache eviction need broader safe allocation integration before automatically unloading them.
4. Under a WebGPU out-of-memory error, invoke the existing fresh-process fallback recovery. It attempts a recovery save while the renderer can still execute; failed saving does not overwrite existing durable saves. Under WebGL2 pressure, return to the menu with an explicit graphics-memory message instead of looping renderer recovery.
5. If Electron reports a renderer process killed for OOM, relaunch once into the fallback menu using existing durable saves. The dead renderer cannot create a new checkpoint. A restart marker prevents automatic restart loops; other termination reasons are not mislabeled as OOM.

High pressure returns to normal only after three healthy inventory passes below 75% of observed limits. Missing metrics remain unavailable, not zero. CPU process private bytes and working-set bytes come from Electron; GPU-process RAM is not VRAM. Chromium/Windows impose varying limits, so there is no universal guaranteed GPU-process ceiling. See [Electron app metrics](https://www.electronjs.org/docs/latest/api/app#appgetappmetrics) and [WebGPU out-of-memory errors](https://developer.mozilla.org/en-US/docs/Web/API/GPUOutOfMemoryError).

No synthetic destructive OOM test has been run against the user's real session. Recovery branches are guarded, but a killed process can lose work since the last durable save. Memory targets and 60 FPS still require normal-play validation.

## Validation checkpoint — October 8, 2026

114 automated tests pass. New cases cover slot generation safety, fixed particle buffers through saturation/expiry/re-emission, shared resource accounting, compressed mip-byte estimates, half-float cube targets, reference-safe texture eviction, metadata-only desktop indexing and backup reads, pooled Rapier mass reset/stale-record rejection, and safe pressure handling.

The packaged WebGL2 probe verifies actual worker execution, visible instanced-sprite particles, buffer reuse, two shared structural map instances across the generated building network, retained city/fixture destruction mass, real Electron save/load and the death-menu return. The final sampled state reports 2,766,708,736 app-private bytes (~2.58 GiB), 48,959,958 estimated texture bytes (~46.7 MiB), 241,106,210 geometry buffer bytes, 6,013,440 decoded sound-buffer bytes and a 616-byte renderer save index. The first pre-sharing probe reported 5,762,609,152 app-private bytes and 1,769,761,300 estimated texture bytes. These are separate scripted snapshots with minor scene variation, not a continuous normal-play benchmark or exact VRAM measurement.

Medium's 1.5 GiB private-RAM target and 192 MiB geometry target are still exceeded. Core gameplay streaming, collider residency, compact chunk deltas, authored Basis conversion and a whole-game allocation audit remain open. WebGPU native performance and actual forced-OOM recovery are not certified by the successful WebGL2 probe.
