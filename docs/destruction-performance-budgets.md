# Dark Rain — Step 8: performance budgets and destruction quality tiers

Next subsystem: [Step 9 — deterministic commands, active debris corrections and multiplayer recovery](destruction-multiplayer.md).

## Contract and current status

This is a proposed release/performance contract for [Steps 1–3](destruction-joints.md), [debris](destruction-debris-manager.md), [tactics](destruction-tactical-layer.md), [audio](destruction-audio.md) and [persistence](destruction-persistence.md). It changes no runtime code. Current source has an F3 `PerfOverlay` and `DynamicResolution` with a 50–100% resolution range. Those systems do not yet enforce the comprehensive budgets below or demonstrate sustained 60 fps. The current resolution governor uses average FPS with a five-FPS tolerance; that is insufficient for this contract.

Updated user requirement: **minor changes across quality levels are allowed; Ultra maximizes destruction detail**. Preserve break-anywhere affordance, useful breaches, structural collapse, gravity, collision and meaningful persistent rubble. Lower settings may modestly reduce secondary fracture detail, independent fine-debris simulation, distant cosmetic simulation, dust and audio layering. Ultra needs its own measured hardware floor; the earlier absolute prohibition on all physical detail scaling is superseded. In future multiplayer, the server selects canonical gameplay geometry/physics; client quality changes presentation detail without contradicting shared collision.

Initial offline profile proposal (not implemented or benchmarked): Low/Medium/High/Ultra awake debris targets **48/72/96/192**, with 16 essential slots reserved within each. Ultra therefore raises whole-world awake dynamic capacity to **256**, resident dynamic capacity to **352**, dynamic hull capacity to **1,280**, and total instantiated constraint capacity to **640** when retaining the table's other reservations. Secondary fragment density scales roughly **0.6/0.8/1.0/1.5** relative to High, with authored validation rather than changing primary breach size. All profiles still need the frame/physics/memory gate; a larger pool is not a performance improvement. The main table below remains the initial High-profile reference, not an Ultra certification.

Finite hardware cannot guarantee arbitrary simultaneous fractures/independent bodies with an absolute count cap and exact behavior for every possible event. These numbers are **hard admission/capacity and release gates for a certified workload**, not a proof that unlimited destruction fits them. A reachable overflow that requires disappearing rubble, disconnected shards glued into one body, or lost collision is a failed design/test, not an approved fallback. Expand efficient capacity or revise implementation before shipping that case. Do not make buildings immune to avoid the test.

## 1. Frame envelope and numeric budget table

Target 60 Hz presentation: **16.67 ms per frame**, with main-thread CPU work <=10 ms and GPU work <=12 ms, leaving scheduling/compositor margin. CPU and GPU overlap: do not add those targets as if they run serially. Measure the actual critical path/present deadline. The following time allocations sum to a 10 ms renderer main-thread target:

| Main-thread work | Per-frame allocation |
|---|---:|
| Input, actors, combat and gameplay | 1.75 ms |
| Rapier fixed step plus contact draining | 3.00 ms |
| Connectivity/stress/fracture admission combined | 0.60 ms |
| Debris transform/binding/upload preparation | 0.45 ms |
| Tactical cover/nav and local A-Life dispatch | 0.65 ms |
| Audio event/control scheduling | 0.15 ms |
| Streaming/save snapshot work on this thread | 0.40 ms |
| Scene traversal, culling, renderer submission | 2.50 ms |
| Unassigned headroom inside CPU target | 0.50 ms |
| **Total** | **10.00 ms** |

GPU envelope: opaque world/shadows/reflections <=8.5 ms, post/viewmodel <=2.0 ms, destruction dust <=1.0 ms, fracture compute <=0.5 ms: **12.0 ms total** on a frame containing each. Async compute is not presumed free or parallel to rendering. Reflections/shadow/cube faces and uploads count in the frame when submitted, not amortized away in reporting.

| Resource/work | Initial limit | Enforcement and counting |
|---|---:|---|
| Awake dynamic Rapier bodies, whole world residency | **160** | 96 debris +32 interactive props +32 ragdoll bodies; one ragdoll costs each physical body, not one actor. These are workload reservations, not currently enforced. |
| Kinematic actor bodies | **64** | Separate from dynamic 160, but included in collision/physics timing. No lowering live combat actor count as automatic quality scaling. |
| Resident dynamic bodies, awake +sleeping | **224** | 128 debris +48 props +48 ragdoll shells. Together with 64 kinematic actors, <=288 movable body records. Fixed environment bodies are separately tracked. |
| Enabled dynamic-body collider hulls | **768** | 512 debris +128 props +128 ragdolls; a compound with 20 hulls costs 20. Static rubble/map collider and contact counts remain separately measured. |
| Active debris fixed joints | **256** | Up to 64 ragdoll and 64 other constraints separately reserved: **384 total instantiated joint constraints**. Logical saved graph edges need no Rapier joint while unresident. |
| Priority debris slots | **16 within 96** | Reserve for nearby support failure/contact-critical work; not 16 extra bodies. |
| Connectivity work per affected damage batch | **1.5 ms total CPU** | Budget across worker slices, not 1.5 ms for each bullet on the main thread. Main-thread connectivity contribution <=0.35 ms/frame inside the 0.60 ms shared allocation. |
| Connectivity slice / capacity | **0.25 ms /512 nodes, 2,048 edges per authored partition** | Check work in small batches; larger actual affected sets are queued worker work across valid partitions with boundary support edges. Partitioning must not alter load paths. |
| Ordinary new body/shape transactions | **8 per physics tick** | Prewarmed capacity for essential primary events; secondary visual work may wait. If essential contact/breach cannot meet its deadline, gate fails. |
| Secondary fracture jobs | **2 per render frame** | Also bounded by child body/hull/geometry reservations; no deletion of the existing physical piece while a result waits. |
| GPU runtime fracture jobs | **1 submitted/frame; 2 in flight** | <=4 bounded kernel/meshing dispatches per job; dispatch count alone does not establish execution time. |
| GPU fracture duration | **0.5 ms total/frame** | Predict admission from measured recent kernel timings; cannot interrupt an already running dispatch at 0.5 ms. No synchronous queue drain/readback in the frame loop. |
| Near-field voxel hero job | **32^3 cells, <=64 seeds** | <=64k output vertices /192k indices; 16 MiB scratch/job, 32 MiB in-flight. This bounds a small prop job, not a whole-building volume. Preserve fixed gameplay cell size; split larger volumes into tiled jobs. |
| CPU/GPU result queue | **32 pending jobs** | Coalesce redundant jobs at the same logical region; reserved primary-impact work has priority. A queue must not delay authoritative damage indefinitely. |
| Dust/smoke live particles | **4,096 city-wide; 1,024 per collapse emitter** | Includes tails; allow four dense emitters at max, with shared admission. Particle reduction affects visuals, not ballistic collision or gameplay dust density. |
| Particle fill | **<=1.0 ms GPU; initial <=2 screen-equivalents blended coverage** | Screen coverage is a monitored proxy; profile actual overdraw. Use a low-resolution local dust layer with depth-aware composition. |
| Debris main-view draw calls | **24 opaque +4 transparent** | Geometry/material buckets, not one call per shard. Multiple buffers/assets must still fit actual backend submission count. |
| All debris/effect draws across passes | **64/frame** | Count shadow/reflection/secondary passes too; instancing does not make them free. |
| Whole-frame renderer submissions | **300/frame** | Diagnostic release ceiling including world, viewmodel, shadows, probes, effects and post; may require stricter limits on measured CPU-bound hardware. |
| Debris visible triangles | **300k/frame main view** | Render LOD only; collision/fracture topology stays authoritative. Measure additional-pass triangles separately. |
| Audio | **48 audible voices; <=8 HRTF sources** | Step 6: 16 critical, 24 destruction, 8 music/ambient; tails count. No lower critical reserve. |
| Destruction resident memory | **128 MiB CPU +128 MiB GPU** | Geometry/hulls/pools/queues included; graphics caches separate only if explicitly reported. Entire world ledger streams by chunk; this is not a disk-save limit. |

Counts are hard allocator/scheduler limits within the tested configuration; execution milliseconds are admission targets and acceptance gates. JavaScript, Rapier WASM and submitted GPU kernels cannot be preempted at an arbitrary stopwatch boundary. Preallocate bounded work, check cooperative slices, measure overruns, then fix the work that violates the gate. Graph deletion still needs a rebuilt union-find O((V+E) alpha(V)); batch dirty changes once, never run one full pass for every hit or scan all buildings each frame.

Large graph jobs can finish in a worker with topology revision checks; stale results are rejected. Complete primary local breach/collision transactions within **two fixed ticks (33.3 ms)** of impact; apply break/support-loss events immediately when decided. A topology result may publish later, but must not visibly keep an already unsupported island floating. Unsupported islands must have a valid gravity/contact representation while detailed connectivity work proceeds. If the chosen architecture cannot provide that without incorrect constraints, it fails the fixture rather than masking the error behind dust.

The 60 Hz physics step is unchanged. Up to two catch-up steps consume the same measured frame budget; repeated catch-up pressure is a performance failure. Never drop simulated time, slow gravity, reduce joint evaluations, or disable contacts as a hidden quality solution. Sleeping saves work only while actual support/contact conditions allow it.

## 2. Scaling ladder — what degrades first

Use measured CPU/GPU bottlenecks, not FPS alone. Apply one change at a time after roughly 0.5–1 second of sustained workload pressure; upgrade only after at least 10 seconds of >=20% work-time headroom. At 60 Hz, an FPS-only upgrade test requiring >65 FPS cannot succeed under a 60-FPS presentation cap. Track uncapped CPU/GPU work durations instead. Keep user-selectable visual floors; minimum-resolution failure is reported as a failed performance gate, not an invitation to degrade mechanics.

1. **Far cosmetic density.** Reduce tiny visual dust/spark/splinter emission and particle lifetimes; decrease noncritical audio layering and expensive panner use. Keep critical warnings, material identity and existing gameplay dust transmittance. Visual and AI concealment must remain perceptually consistent: use a cheaper density representation if particle count is lower, not invisible opacity known only to AI.
2. **Dust rendering cost.** Particle cap 4,096 ->2,048 ->1,024, dust target half ->quarter resolution with depth-aware upsampling. Widen only an already validated far standard-tier visual transition if necessary, never the damaging collapse footprint or its physics timeline. If concealment is insufficient, use Step 5's visible pose-matched handoff; extending opacity is not a substitute for correct falling collision.
3. **Noncritical rendering updates.** Lower distant probe refresh, distant shadow resolution and reflection render resolution/sample cost. Keep meaningful reflections and timely nearby moving-object shadows. Spread cube faces/work where backend/asset support permits; avoid all six expensive city renders at once. Do not cull a barrier from collision merely because it is outside the shadow map.
4. **Rubble and secondary detail.** Lower distant mesh/tessellation detail, normal/parallax samples and material variant cost; keep breach silhouettes and stable rubble contours that affect aiming/navigation. Batch/instance aggressively. Offline profiles may modestly lower secondary fragment counts and fine-debris simulation targets, while preserving material accounting, gravity and meaningful collision. Existing saved meaningful pieces cannot vanish when a setting changes. Primary breach/support rules remain intact; multiplayer authority geometry never depends on a client's profile.
5. **Post effects and resolution.** Reduce bloom resolution/sample count and secondary post cost, then scale internal world rendering 100 ->85 ->70 ->60 ->50%; UI stays native resolution. Preserve readable targets, weapon sights and holes. This chiefly helps GPU-bound workloads, not CPU scene traversal.
6. **Background scheduling.** Slice nonurgent distant A-Life reasoning, derived cover/nav candidate work and serialization/stream uploads. Dirty local hazards invalidate immediately; nearby combat perception, firing, collision and support-loss work retain deadlines. Avoid moving CPU stalls into huge worker-result/IPC copies.

If the lowest visual level still misses 60 fps, stop automatic degradation. Profile and optimize pooling, traversal/culling, collision broad phase, authoring geometry, caching, worker partitioning and shader work while checking identical gameplay outcomes. Certify hardware only after it passes. A future minimum specification must come from actual device results, not a guessed GPU model.

**Never degrade:** break-anywhere affordance, deposited-energy/material rules, primary breach location/size, support connectivity/load failure, gravity, actor/ragdoll collision, projectile penetration, persistent meaningful rubble, physics time, accurate route/cover state, faction consequences or critical combat audio. Secondary fine-fragment fidelity may differ by offline profile; no setting makes already unsupported structural material float or erases existing rubble. The hero/standard distinction remains stable. Compound optimization remains valid for genuinely connected members with breakable logical bonds, not gluing unrelated cover into one body. Multiplayer shares canonical gameplay geometry/collision even when visual detail differs.

## 3. Profiling plan inside Electron

**Measure the packaged game on the user's machine first.** Record Electron/Chromium/Three/Rapier versions, build revision, backend, GPU adapter/driver, CPU, RAM, display resolution/refresh, power mode and quality/scaling state. Capture primary WebGPU and WebGL2 fallback separately; an adapter existing does not prove hardware acceleration, compute performance or backend parity. Disable development server/hot reload for final results; use isolated save profiles.

| Measurement | Tool and method |
|---|---|
| Frame pacing | Existing F3 overlay plus proposed preallocated telemetry rings for RAF intervals, CPU frame work and presented/dropped frames from Chromium traces. Report median/p95/p99/max, one-percent low and missed deadlines, not only average FPS. |
| Main-thread bottlenecks | Electron DevTools Performance with User Timing spans: Rapier step, contact drain, connectivity, fracture admission, upload prep, AI, scene traversal and render submit. Inspect long tasks, GC, compilation and allocations. Keep record durations short enough to avoid trace overhead dominating. |
| Process/compositor/GPU scheduling | Main-process Electron `contentTracing`: discover categories available in the installed shell, capture relevant renderer/V8/GC/GPU/compositor/scheduler/worker categories and export traces for compatible Chromium/Perfetto inspection. Do not assume every trace includes detailed hardware GPU timings. |
| GPU render/compute duration | WebGPU timestamp queries when the adapter exposes `timestamp-query`; use installed Three timestamp hooks only after verifying integration. Resolve into a small delayed readback ring; no `await queue.onSubmittedWorkDone()` per gameplay frame. Measure fracture and dust separately from world/shadow/post. Without timestamp support, use supported Chromium/GPU tools and controlled isolated pass comparisons; label timings inferred rather than inventing GPU milliseconds. |
| Physics | `performance.now()` around WASM `world.step`, separate JS event drain. Counters: awake/sleeping/kinematic bodies, enabled hulls, joint constraints, contacts, island size, creation/removal churn, CCD work and catch-up steps. A body count alone does not predict cost. |
| Connectivity/fracture queues | User Timing in workers and renderer with event IDs/revisions. Record V/E, slices, total job time, queue length, oldest age, rejected stale jobs, dispatch dimensions, mesh output size and readback latency. Measure impact-to-collision commit latency, not just compute dispatch call duration. |
| Draw submissions/particles | Three renderer counters accumulated over every pass with deliberate reset boundaries; verify how BatchedMesh/multi-draw is reported by the active backend. Track bucket occupancy, triangles, geometry bytes, transparent overdraw, emitters and screen coverage. |
| Memory/allocations | DevTools Memory/allocation sampling, process metrics and explicit pool/buffer ledgers; take before/after collapse and unload/revisit samples. WASM/GPU memory are not fully represented by JS heap. Check garbage collection pauses and unreleased GPU buffers rather than treating a stable JS heap as proof. |
| Audio | Step 6 counters for voices/tails, priority steals, HRTF nodes and duck envelopes; supported browser audio diagnostics/listening recordings. Inspect underruns/CPU with available shell/OS tooling. Audio-thread cost is separate from renderer control time; test threat-cue recognition under collapse. |
| Filesystem | Save snapshot/IPC/encoding/write/sync spans by generation, bytes per chunk and acknowledgement latency. Verify save/reload correctness under load; move serialization off the frame path without mixing snapshot revisions. |

Telemetry updates HUD at 4 Hz, exports buffered results after the run and avoids per-frame log strings, sorting full history or synchronous filesystem calls. Measure with DevTools/tracing open for diagnosis, then repeat with them closed for acceptance. GPU readback/trace recording may change performance; document instrumentation overhead. Synthetic CPU throttling helps find bottlenecks but is not a substitute for an actual weaker GPU/driver.

## 4. 60-fps release gate and reproducible scenarios

Normal play includes traversal/streaming, combat, repeated chipping, secondary fracture, two overlapping collapses, dust, ragdolls and autosave. It does not exclude collapse frames merely because they are expensive. Define and publish the certified workload with **24 nearby AI actors, four 8-body ragdolls, 32 active interactive props and up to 96 independently active debris bodies**, plus all Step 5 microdamage/support rules. More reachable debris must be accommodated by a validated implementation or expanded measured capacity; that count cannot authorize deletion or stop the player destroying another wall. Repeat stress cases until the count/latency assumptions are actually justified.

Test routes: (1) dense downtown traversal and first streamed district entry; (2) occupied indoor storefront firefight, glass and repeated wall chipping; (3) hero garage support loss with simultaneous attacks and falling loot; (4) two standard warehouse collapses with interior observers and wind/low-effects visibility; (5) full rubble revisit and disk save/reload; (6) menu/death recovery. Warm the repeat run, but also record first-use shaders/uploads during playable entry. Compile/allocate known assets behind a visible loader where possible; no surprise cold compile is exempt after gameplay starts.

For each supported machine/backend/quality profile, run three reproducible ten-minute sessions plus a 30-minute accumulated-rubble soak. Use fixed seeds and scripted inputs where useful but also manual movement/fighting. At a 60 Hz presentation target, require:

- Main-thread work p99 <=10 ms, GPU work p99 <=12 ms where measured, and observed deadline readiness <=16.67 ms. A budget miss requires investigation even if averaging hides it.
- Steady gameplay average >=59.5 FPS, one-percent low >=59 FPS, and fewer than 0.1% missed 60 Hz presentation slots attributable to the game; no repeated 33 ms frames. These tolerances reflect measurement/scheduling noise, not permission to target below 60.
- No recurring application-induced >25 ms hitch; autosave/streaming/first combat use count. Separate unrelated OS interruptions explicitly with evidence, never discard ordinary slow frames from reports.
- No core capability, collision, gravity, material-accounting, breach, audio-warning or persistence failure while scaling. Check primary damage/breach/support behavior across offline profiles, recording permitted secondary-detail differences. In multiplayer, require identical canonical gameplay topology across client quality settings. Exact chaotic debris trajectories need not be bit-identical across backends, but authoritative corrections and mass/collision/support rules must hold.

Capture worst frames with their causes and work counters, not just a success screenshot. A failed GPU/CPU budget triggers focused optimization and a rerun of the failing scenario. Build/typecheck/unit checks remain prerequisites, not evidence of 60 fps. **No current hardware is declared compliant by this architecture document.**

Sources: [Electron contentTracing](https://www.electronjs.org/docs/latest/api/content-tracing), [DevTools runtime performance analysis](https://developer.chrome.com/docs/devtools/performance), [WebGPU query sets](https://developer.mozilla.org/en-US/docs/Web/API/GPUQuerySet), [Rapier body types and sleeping](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/). Installed source inspected: `src/systems/PerfOverlay.js`, `src/systems/DynamicResolution.js`, `node_modules/three/src/renderers/common/Backend.js`.
