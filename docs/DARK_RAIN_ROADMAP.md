# Dark Rain — development roadmap

7 October 2026. Builds on the existing game. The concept defines the destination; milestones below make progress reviewable without discarding working combat, physics, quests, assets or the Windows workflow. Dates are not promises of completion. Scope advances when acceptance gates pass.

## Vertical slice

A 20–30 minute route through the Downtown–Sweet Auburn edge, adjoining reclaimed woodland, a checkpoint and a damaged relay building. Two factions compete over power and water. The player finds the story in evacuation notices, flooded maintenance rooms, barricade directions and damaged equipment before meeting the quest giver. Extend Last Signal into three physical approaches plus several consequential resolutions. The world has one representative anomaly, one pressure front, survival/treatment, contextual loot, a barter transaction and a defensible shelter.

The destruction sandbox is a reachable maintenance/test scene using the SAME support/fracture/save services as the world. It contains brick, reinforced concrete, wood, ordinary and laminated glass, sheet metal and drywall samples, plus a two-storey structure. It exposes damage, carried loads, queued bodies, collision contacts and time budgets. Begin with existing masonry and Rapier; each new material must leave plausible remnants before integrating it across Atlanta.

Slice gate: traversal on foot connects every route without invisible walls/floating props; all three quest paths finish; faction consequences survive reload; one building can be breached/chipped/collapsed without disappearing masonry; roof loss changes shelter; wounded enemies/player recover consistently; death-to-menu/music work; browser fallback and desktop build remain functional. Hardware runs must cover standing, movement, firefight, first-load traversal and collapse. Target 60 FPS at a declared resolution/preset on a declared mid-range GPU; record p50/p95/p99 and stalls. Integrated graphics gets its own playable lower-quality target. Do not call software-rendered tests a hardware benchmark.

## First 20 Phase 1 tasks, ordered

| # | Task | Architecture / reused foundation | Completion evidence |
|---|---|---|---|
| 1 | Lock naming, scope, original lore and geography provenance | Existing menu/docs; design baseline | Dark Rain everywhere; measured vs authored data distinguished. Naming complete; design delivered. |
| 2 | Capture baseline route and crash/save/perf behavior | F3, current renderer, current test suite | Hardware route recording and saved metrics; automated build alone insufficient |
| 3 | Use official neighborhood geography for district identity | WorldManager, existing shells/styles | **Initial implementation complete:** offline polygons, district profiles, journal survey; street fidelity still pending |
| 4 | Repair disconnected transport traversal | AtlantaCorridor, Rapier static colliders | **Initial implementation complete:** bridge approaches; full player route audit remains |
| 5 | Stabilize generated IDs and seed streams | City/building/destruction save pipeline | Same seed creates same cell/container IDs across launches; load old saves through explicit layout version policy |
| 6 | Add typed transactional desktop saves | SaveSystem + context-isolated preload + Electron main | Atomic file replacement, slot validation, recovery, migration from browser saves; interruption tests |
| 7 | Introduce strict TypeScript at system boundaries | WorldDescription, SaveEnvelope, damage/inventory events | `check` rejects incompatible payloads; existing JS adapters remain until converted |
| 8 | Adopt electron-vite in place | Existing Electron window/preload and Vite renderer | Two-command install/dev opens current game; packaged path/assets/preload audited |
| 9 | Profile and extract pure generation into workers | Existing terrain/noise/scatter, geometry batching | Transferable typed buffers; bounded uploads; cancellation and deterministic seeds; no scene objects in worker |
| 10 | Add one adjacent streaming terrain chunk | Existing urban surface and outskirts | Seam heights/normals and collision agree; unload/reload retains changes |
| 11 | Establish lean ECS IDs and simulation ownership | Existing Enemy/NPC/ALife adapters | Stable IDs, component deletion/query tests, no duplicate actor authority |
| 12 | Build isolated material destruction sandbox | Existing masonry/support/Rapier services | Staged full collapse; material remnants, mass and persistent contact behavior checked |
| 13 | Prototype r186 renderer/TSL conversion in current app | Existing light, sky, material and post references | Side-by-side daylight/night/wet/interior checks; no main renderer switch before visual parity |
| 14 | Add GPU anomaly particles with fallback | Existing anomaly gameplay volumes | WebGPU storage compute; lower-count WebGL2 visual path; identical damage/force decisions |
| 15 | Produce one authored Atlanta street/art kit | Existing enterable shell contracts | Brick/concrete/glass PBR, true windows, roofline variants, human-scale interior and contextual loot |
| 16 | Import a bounded real street/parcels/elevation sample | Geography projection + worker descriptions | Named connected streets at human scale; retaining walls/crossings; no source-data licensing gaps |
| 17 | Make combat/treatment read physically | Current wounds, viewmodel and rig | Weapon clearance, per-weapon reload checkpoints, reliable hits/armor, trauma and bandage checks |
| 18 | Extend Last Signal into three physical paths | Existing quest/dialogue/skills/factions | Stealth/service repair/combat solutions; outcomes alter access/supply rather than just text |
| 19 | Connect structural shelter, emission and supply ecology | Existing support graph, EmissionSystem, A-Life | Roof collapse invalidates shelter; blocked crossing reroutes a supply party and changes stock |
| 20 | Package and qualify the slice | electron-builder, native save bridge, quality ladder | Clean install/offline launch, 30-minute test route, hardware frame-time report and regression captures |

“Initial implementation complete” means the stated first pass exists, not that the entire milestone is production-ready. The modern foundation was implemented after the user authorized the upgrade: Three r186, node renderer/TSL, strict typed main/preload/render/terrain/save modules, file-save IPC, terrain worker, capability-gated anomaly compute and electron-vite build/package. New material types, ECS/streaming and full gameplay typing remain planned work. Hardware GPU qualification is still outstanding.

## Subsequent phases

### Phase 2 — Atlanta that reads as Atlanta

Expand the first street sample along the actual Downtown/Midtown axes. Replace uniform grids with measured centerline topology, parcel-aligned footprints and distinct blocks. Preserve street slopes and grade-separated rail/highway crossings. Author original skyline silhouettes from real architectural proportions; build landmark exteriors and selected accessible interiors. Keep others as convincing shells with clearly blocked entrances until interior streaming is ready.

Add a BeltLine segment, a MARTA entrance/platform/service tunnel, a park clearing, a waterworks site and connected industrial approaches. Each earns its cost through navigation, shelter, trade or faction conflict. Add biome-aware worker scattering with pine/hardwood/riparian variations. Expand LOD and occlusion, texture compression and mesh compression before increasing density. Gate: players navigate by distinctive landmarks without arrows, routes remain connected, interiors and street art match the same material scale, no new loading hitches.

### Phase 3 — communities and consequences

Implement fortifying an existing room, storage, workbench repairs, water collection and a small power network. Shared structural integrity makes bases vulnerable. Add two resident jobs, resource/needs simulation and one raid scenario that scouts and breaches a real weakness. Expand factions to the five original groups and geographically distinct markets. A-Life destinations/stock are saved, parties can retreat and route around damage. Gate: a week's simulated economy cannot invent or duplicate goods; raids and shelter repairs affect live routes and residents.

### Phase 4 — fidelity and breadth

Build a material fracture library with irregular interior surfaces, wood grain, limited rebar joints, layered drywall, laminated glass and authored sheet-metal bending. Add water-main breaches and carefully bounded pressure-front/anomaly structural loads. Introduce connected slab islands and local rubble reactivation, keeping static persistent far rubble. GPU dust gains localized density and lighting. Upgrade human/weapon/garment assets and original animation coverage before adding more weapon counts.

Stream regional destinations: airport, CDC-campus-inspired original mission areas, western river crossings, separate mountain regions and northern foothills. Add dedicated authored missions with three solutions and meaningful independence. Multiplayer-ready schemas do not imply simultaneous networking work. Gate: expanded content meets slice art/interaction/performance standards; reduce region breadth before lowering those standards.

### Release preparation

Signed Windows package, crash diagnostics with user-controlled submission, save migration policy, input/accessibility testing, update rollback and offline mod boundaries. Configure updater only after a real signed hosting/release pipeline exists; never poll an invented endpoint. Hardware matrix includes WebGPU, forced WebGL2, discrete/integrated GPUs, low memory and corrupted/older saves. Reproducible dependency locks and licensed asset manifests accompany releases.

## Five biggest risks and early experiments

| Risk | Consequence | De-risk experiment and gate |
|---|---|---|
| WebGPU/TSL/Electron compatibility | Blank boot, changed PBR lighting, unsupported compute, poor fallback | In-app backend test with one street/interior/wet surface/anomaly. Log actual backend and capability. Force WebGL2 and compare readable output. Retain current renderer until TSL materials/post/sky/reflections have proven parity. |
| Hundreds of ECS/A-Life agents | Main-thread spikes, duplicate ownership, lost state on promotion | Synthetic 200/500-agent deterministic scenarios; distance-tier simulation and spatial queries; profile intent separately from rendering/physics. Promote/demote while retaining inventory/wounds. ECS acceptance is measured, not inferred. |
| Procedural/handcrafted seam and Atlanta scale | Floating roads, gaps, implausible geography, corrupted streaming state | One real-data street tile joined to one worker terrain tile, with height/normal/collider tests and traversal captures. Distinguish geographic travel compression from human geometry scale. |
| High-fidelity destruction | Body explosions, stuck debris, save bloat, unrealistic fragment shapes | Early material sandbox before more city integration. Track mass, queued fragments, joints, contacts, sleeping piles, shelter/path changes, save sizes and hardware frame time. Set budgets and material-specific authoring gates. |
| Electron packaging/startup overhead | Large downloads, broken assets/preload, slow boot and missing persistence | Package the slice early into an unpacked test app, then installer/portable. Test fresh path/offline launch, worker/WASM/texture loading, user-data saves, backend and memory. Separate authored-content size from shell overhead. |

Additional art/scope risk: the procedural building and character kits cannot reach the user's desired realism through postprocessing alone. Commission or author a small excellent kit, then expand its variation. Benchmark against reference composition and real dimensions, not a claim of parity with AAA budgets.

## Current pass and limitations

Added selected official Atlanta neighborhood geometry, reversible geographic projection, district-informed height/facade profiles, reclaimed park reservations, a north-up journal map and graded overpass approaches. Reuses WorldManager, enterable buildings, batching, collision and FieldJournal. Existing firearms, quests, Rapier, skies and rendering remain in service.

Not yet actual centerline roads, surveyed elevations, true landmark replicas, MARTA interiors, full Perimeter or a geospatially scaled open Atlanta. Park locations are approximate authored anchors; only neighborhood boundaries are measured source geometry. Current towers retain procedural facades. This pass provides a trustworthy scaffold for real city data without calling the existing generated streets accurate.
