# Dark Rain — game design and concept review

Design baseline: 7 October 2026. The attached concept is the design brief; the user's later directions take precedence: **the only title is Dark Rain**, and development builds on the existing game wherever possible. No alternate titles or replacement game. This document distinguishes implemented foundations from design targets.

## High concept

Dark Rain is a first-person survival game in a ruined Atlanta where damaged infrastructure, abnormal weather, and competing communities determine whether a journey is worth its cost. Grounded weapon handling and body-mounted camera motion make danger intimate; faction choices give survival political consequences; anomalies and autonomous groups keep familiar routes uncertain. The city tells its story through abandoned work, failed evacuations, and attempts to rebuild before lengthy quest exposition becomes necessary.

The player is a displaced municipal survey worker, with a background chosen during character creation. They can read infrastructure, negotiate access, exploit weaknesses, or fight, but they are neither a chosen savior nor the sole cause of every event. Humans remain capable of organizing, compassion, and cruelty. There are no borrowed characters, faction names, fictional histories, or recognizable copied game assets.

## Review of the brief against the live game

| Area | Existing foundation | Gap to the brief |
|---|---|---|
| Desktop workflow | Electron 44.7, electron-vite 5, strict main/preload and recoverable file-save IPC, Windows package | Typed migration of remaining gameplay, diagnostics and release/update pipeline |
| Rendering | Three.js 0.186.1, WebGPURenderer/WebGL2 fallback, TSL sky/anomalies/post/material/reflections, GPU anomaly compute, body motion and dynamic resolution | Hardware WebGPU/compute qualification; authored art and broader compute work |
| Atlanta | Accessible procedural shells, skyline, highway/rail corridor, overgrowth, outskirts | Actual street centerlines, parcels, elevations, distinctive authored landmark assets |
| Current geography pass | Official neighborhood polygons drive district profiles; north-up journal map; connected overpass approaches | Regional compression remains; roads still follow the previous grid |
| Combat/characters | Weapons, articulated viewmodel, locomotion, wounds, armor, blood, Rapier ragdolls | Authored weapon/garment assets, locomotion transitions, clearance/IK, jams and penetration |
| Survival | Hunger, thirst, stamina, radiation, bleeding | Fatigue, exposure, illness, organ/limb trauma and meaningful treatment |
| Choices/world | Six faction reputation entries, skills/perks, Last Signal mission, A-Life parties | Persistent territorial economy, more independent outcomes and distance-tier simulation |
| Destruction | Local masonry chips, support graph, rigid fragments, persistent piles, glass | Material-specific fracture authoring, connected slabs, deforming steel, rubble reactivation |
| Saves | Browser storage, serialized world/destruction and progression | Transactional filesystem saves, stable generated identities, schema migrations, all simulation state |
| Scale | Static batching, collision grids, instance pools, quality governor, typed worker terrain generation | Chunk streaming, scalable ECS, broader worker generation and measured hardware budgets |

The art deficit is not solved by a renderer upgrade. Lighting, measured proportions, silhouettes, material response, vegetation, animation, and coherent city composition must improve together. WebGPU enables compute and explicit storage-based workloads; it does not guarantee faster scene traversal or photorealism. ECS improves data organization when systems actually operate on compact arrays; changing the label on current objects does not provide that benefit. Rapier replay determinism requires fixed steps, stable input/order, and controlled randomness; cross-machine bitwise identity is not assumed.

“Everything visible can break” is a long-term interaction rule, not a promise that millions of fragments simulate simultaneously. Breakable material can leave persistent static rubble after sleep, with local reactivation when disturbed. Anything excluded needs a believable explanation, such as massive terrain rock, and the slice must expose exclusions rather than disguise them.

## Setting and geography

Use real Atlanta as the geographic skeleton and original disaster history as the fiction. Preserve relative positions, corridor connections, street slopes, and recognizable skyline spacing. Keep human, vehicle, stair, door, and room dimensions at metre scale. Regional travel distances may be compressed in the current build, clearly recorded in the map metadata; the destination is streamed human-scale districts rather than miniaturized architecture.

The first authored district is the Downtown–Sweet Auburn edge, with a Castleberry industrial approach and an Old Fourth Ward connection. Midtown extends north, Grant Park southeast, West End southwest. Freight infrastructure and the Downtown Connector are separate networks with legitimate crossings, grades, and ramps. Bridges need support clearances and traversable approaches, not disconnected elevated platforms.

| Anchor | World role | Environmental storytelling |
|---|---|---|
| Downtown/Midtown | Urban density, vertical observation, civic/office scavenging | Evacuation bottlenecks, dark office floors, improvised communications |
| CDC campus area | Later research/containment district northeast of the core | Conflicting experiment logs and emergency decisions; original interior/story |
| Airport | Later large contested southern hub | Grounded aircraft, closed gates, rival supply depots |
| BeltLine | Reclaimed corridor around the core | Gardens, caravan rest points, hidden crossings and ambush signs |
| MARTA | Connected underground shelters and risky transport | Blocked platforms, flood levels, improvised maintenance routes |
| Piedmont/Grant parks | Clearings and woodland within urban fabric | Abandoned aid camps, garden plots, wildlife reclaiming paths |
| Stone/Kennesaw mountains | Later geographically separate eastern/northwestern zones | Observatories, watch posts, cult/research conflict |
| Chattahoochee | Western/northwestern water and trade system | Flood marks, filtration camps, broken bridges |
| I-285 | Regional urban/suburban boundary and route network | Inspection posts, interrupted traffic and escape narratives |

Outside the Perimeter is still metropolitan suburbia in many places. Do not instantly replace all development with forest. Transition through subdivisions, industrial sites, tributaries and farms; larger foothill terrain belongs farther north. Pine/hardwood mix, riparian vegetation, clay cuts, invasive vines, and humid seasonal light define Georgia. Biome masks derive from elevation, slope, moisture, land use, and disturbance rather than uniform random trees.

Reference hierarchy: official City GIS for neighborhoods/parcels/available elevations, transport authorities for corridors and station relationships, licensed map data for street centerlines, reference photography for form/material, original authored assets for the game. Preserve provenance and usage conditions per dataset. The downloaded neighborhood layer is a reference dataset, not a source of exact road/building models. Existing terrain remains procedural and currently flattens the core; that is a known accuracy gap.

## Nested loops

Minute: observe a route → decide whether to avoid, bargain, or engage → scavenge contextual supplies → assess injuries, ammunition and weather → reach a defensible stopping point. Loot belongs on shelves, in workstations, vehicles and containers; loose ground loot needs a visible event explaining it.

Hour: accept a faction problem → gather evidence or materials along competing routes → resolve it through force, stealth, a skill or negotiation → receive changed access/prices → repair or improve shelter. Rewards change the next expedition, rather than inflating every opponent's health.

Session: survive a pressure-front event → discover what autonomous factions did → reopen, abandon or contest a route → improve a base/community → uncover another layer of the disaster. Permanent destruction and shortages make decisions visible between sessions.

## Survival

Purpose: make planning and recovery matter without constant chores. Hunger/thirst affect endurance before causing death. Fatigue harms aim/reaction and is restored by safe sleep. Wounds distinguish bleeding, pain, fracture and contamination; bandaging stops blood loss but does not instantly heal trauma. Wetness, wind and temperature determine exposure; shelter and dry clothing help. Radiation and disease have detectable causes, stages and treatment. Backpack slots and weight constrain carrying, with long items requiring suitable mounting.

UI: breathing and movement communicate exertion; inspecting the body opens a medical panel; pack inspection shows volume/weight; accessible optional status feedback remains available. Avoid treating blood on the lens as a medically precise health meter. Default immersive mode reduces persistent HUD; accessibility can restore legible information.

Architecture: Survival, Wound, Exposure, Inventory and Equipment components on ECS entities. Survival advances at 1 Hz, trauma treatment through authoritative events, inventory transactions atomically. Weather exposure samples cached shelter/biome data. GPU particles visualize rain and contamination; they do not decide damage.

Scenarios: a bleeding survivor trades a battery for a bandage rather than carrying more ammo; a wet night expedition ends early to dry clothing; a contaminated pump creates illness that affects both a caravan and local water prices.

## Building and community

Purpose: create a stake in the world and useful economic demand. Begin with fortifying existing rooms; expand into modular walls, gates, watch posts, workbenches, rain collection, gardens and generators. Resources are material-specific reclaimed panels, fasteners, wire, filters and fuel. Repairs restore particular damaged components at real costs. Settlers need safety, water, food and tasks; defenses provide sightlines, barriers and alarm coverage rather than an abstract defense score.

UI: a physical placement tool with footprint/connection feedback, workshop inventory, maintenance ledger and visible NPC work. Preview explains failed support and obstruction. Raiders scout approaches, breach the weakest route and steal supplies; mutants can force gates but do not behave like coordinated engineers.

Architecture: BuildPiece, SupportNode, Storage, WorkOrder, PowerConsumer and ResidentNeeds components. Player structures use the same material/support pipeline as generated buildings. Render batches per chunk; keep logical IDs separate from mesh instance slots. Production/needs tick at 1 Hz; distant settlements use coarse scheduled transactions. Structural changes queue bounded physics work.

Scenarios: recovering a pump restores a water-trade route; fortifying the front door fails when raiders exploit a broken side wall; destroying an enemy checkpoint yields reusable metal but blocks one's own supply convoy.

## Combat and stealth

Purpose: dangerous, readable encounters where positioning and commitment outweigh enemy health inflation. Weapons have distinct recoil impulses, cyclic rates, stance-dependent sway, reload stages, magazine states and handling masses. Jams are tied to condition/ammunition/contamination with clear recovery, not arbitrary punishment. Ballistics use fixed-step projectiles, drop and bounded material penetration; hit energy/location/armor determine trauma. Melee consumes stamina. Suppression affects behavior and steadiness without disabling player control.

UI: optional minimal crosshair; magazine check reports approximate rounds until a suitable perk improves estimation. Reload and clearance motions are physically legible. Near-wall lowering prevents gun geometry passing through walls and blocks firing when obstructed. Sound, silhouettes, sightlines and cover communicate threats.

Architecture: Transform, Velocity, WeaponState, Magazine, Armor, Wound, Hearing and Visibility components. Weapon/ballistic simulation at 60 Hz with ray/sweep queries; visual IK and spring motion interpolate. Light/sound stealth uses spatial indices and cached zones. GPU renders tracers, impact splinters and smoke but CPU confirms hits. Author original animations from reference principles rather than recreating identifiable assets.

Scenarios: a loud breach draws a roaming party; a weak cartridge fails through a concrete wall while an exposed leg remains vulnerable; a cautious player bypasses a checkpoint through service rooms rather than defeating everyone.

## Factions and reputation

Purpose: offer competing believable answers to survival. Five original groups: **Civic Relay** (neighborhood mutual aid), **Containment Directorate** (emergency authority), **Watershed Institute** (research/filtration), **South Terminal Compact** (airport logistics), **Ridge Covenant** (mountain community with spiritual interpretations). Raider networks remain separate opportunistic actors. Existing saved internal faction IDs remain until an explicit migration maps them; display-name changes cannot silently erase reputation.

Reputation records trust, grievance and witnessed actions; thresholds gate aid, restricted stock, shelter and negotiations. Helping one group can hurt another without every act producing a universal ripple. Grave betrayals and quest outcomes do not fade back to neutral. Independence is viable through trade and self-built shelter, with lost institutional support as a real cost.

UI: journal records observed consequences and faction terms; NPCs express changed trust. Prices disclose discounts, access conditions and shortages. No colored world-space quest arrows.

Architecture: Faction, Reputation, QuestState, WitnessEvent and AccessPolicy components. Major mission state machines have at least three tested solution paths and persistent aftermath flags. Economy/relations tick at low frequency; agents use shared access queries. GPU adds no narrative authority.

Scenarios: three solutions recover a station relay—negotiate entry, repair a flooded service bypass, or fight through a barricade; a faction rewards containment while residents lose electricity; evidence can be published independently instead of handed to a patron. Last Signal is the existing foundation to extend, not replace.

## Anomalies, artifacts and emissions

Purpose: make infrastructure and natural conditions dangerous in ways ordinary combat cannot solve. Gravitational fields redirect forces, electrical fields seek conductors, thermal fields accumulate heat, and chemical fields contaminate surfaces/water. Hazards advertise themselves through debris motion, instrument readings, sound and material effects. Artifacts confer useful bounded benefits with exposure, upkeep or equipment penalties. Detectors have range/discrimination tiers; throwing a probe tests a path.

Pressure fronts warn through radio/static, animal movement and the sky before requiring shelter. Shelter depends on intact overhead structure and shielding; a collapsed roof invalidates it. Do not simply check a legacy building rectangle after destruction.

UI: handheld detector/compass, journal field notes, original radio warnings; readable optional warnings. Artifacts display both benefits and costs in equipment inspection.

Architecture: AnomalyVolume, Exposure, ArtifactModifier, Detector and EmissionState components. CPU fields apply authoritative force/damage and influence support loads. TSL compute animates particle storage buffers on WebGPU; WebGL2 uses a reduced instanced analytic/worker path with the same gameplay volumes. Particle results never determine whether the player is hit.

Scenarios: an electrical anomaly energizes a railing after rain; a gravity field tears weakened parking supports; a filtration artifact slows thirst but raises cumulative exposure, changing expedition duration.

## Living world and economy

Purpose: make arrivals feel like discoveries of ongoing lives. Parties have destinations, supplies, affiliations and risk tolerance. Patrols escort cargo, negotiate passage, fight, retreat and recover; mutant packs hunt within territories and migrate after resource depletion or fronts. Trade prices follow stock, route risk and demand, with bounded changes and arbitrage costs.

UI: overheard radio, tracks, abandoned cargo, journal reports with uncertainty and market stock. Offscreen encounters leave explainable traces, not spawns directly behind the player.

Architecture: recommend a **lean custom ECS for the migration**, with stable generation-tagged numeric entity IDs, typed-array Transform/Velocity/Health/Faction/SimTier columns, bitset membership, dense iteration and separate sparse narrative/inventory records. Existing actor classes initially adapt to ECS IDs; only move ownership once validated. This avoids forcing a library rewrite of the mature procedural game, but needs its own deletion/query/serialization tests. Fixed tick order: input → intentions → movement/physics → damage → interactions → faction/economy events → persistence. Nearby agents 30 Hz intent/60 Hz movement, mid-distance parties 2 Hz, distant parties .2 Hz; rendering interpolates. Promote/demote without creating duplicate inventory or resetting wounds. Workers generate immutable world descriptions; live entity mutation stays with the simulation owner.

Scenarios: a bridge collapse reroutes water deliveries and raises price locally; factions fight over a pump before the player arrives; a mutant migration leaves tracks and missing livestock without every distant animal getting a rigid body.

## Progression

Purpose: specialize without level-scaled opponents. Background traits trade advantages for costs; perks open tactics and checks rather than multiply health endlessly. Weapon expertise improves control, engineering reduces repair waste, fieldcraft helps hazard interpretation, diplomacy unlocks compromises. Skill checks have alternate routes, not compulsory stat gates that strand a mission.

UI: journal skill/perk pages explicitly name costs, exclusive paths and effects. World dialogue shows checks and fallback consequences. Fixed district dangers are learned from warnings and encounters.

Architecture: Skill, Trait, Perk and Modifier components; apply caps in one authoritative modifier service. Persist points, exclusive choices and check outcomes. GPU has no progression role.

Scenarios: steadier rifle aim costs sprint recovery; an engineering character reopens a service door without combat; a negotiator obtains monitored access but must surrender a scarce transmitter as collateral.

## Destruction direction

Connectivity and carried loads decide structural failure; local damage opens fracture surfaces and weakens links. Material damage thresholds may exist internally, but buildings have no single health pool or displayed health bar. Support loads include floors, equipment and occupants. Damage produces recoverable material, falling mass and sound. Roofs/floors form connected islands until fracture separates them; unsupported islands fall rather than individual cubes vanishing.

| Material | Near-field behavior | Persistent result |
|---|---|---|
| Brick/mortar | Mortar failure, brick separation, irregular chipping | Brick pile and exposed cavity |
| Concrete | Prefractured aggregate chunks, dust, rebar-linked islands | Mixed slab/aggregate heap and exposed reinforcement |
| Wood | Grain-oriented splinters, cracking beams | Boards/shards and failed joints |
| Glass | Tempered small shards; laminated cracking/sagging before release | Frame, residual cracks and large/small shards |
| Sheet steel | Authored dent/bend stages, torn fasteners, eventual separation | Bent sheet, frame and sharp salvage |
| Plaster/drywall | Thin chips plus powder; underlying studs remain | Layered breached wall and sparse fragments |
| Tires/tanks | Rolling compliant approximation; staged leaks/rupture | Recoverable parts, persistent spills/fire state |

Author fracture sets offline by material, with intact/damaged/interior face material assignments and physics hulls. Use Voronoi patterns for aggregate, mortar layouts for brick, grain-aligned cuts for wood and preauthored bends for metal. Do not claim rigid Rapier bodies simulate deforming sheet metal. Rebar uses limited joints until stress failure; full continuum simulation is outside the small-team scope.

Pipeline: hit/sweep → material fracture/link weakening → affected support graph → detach islands within budget → Rapier bodies → instanced transforms → sleep/static collider → per-chunk persistence. Queued chunks remain represented until activated; they stop supporting failed neighbors. Reawaken a local pile only on a real disturbance. Main-thread physics remains authoritative; GPU dust is visual. Destruction changes shelter queries, paths, cover, markets, noise and faction actions. Record both the changed route and its cause.

Audio layers: sharp material crack, load/stress creak before failure, low collapse rumble, first impact and quiet settle foley. Occlusion and distance reduce voice count. Dust has localized density/volume behavior; it never restores the removed distance fog.

Proposed budgets to measure, not achieved FPS guarantees: 60 Hz physics; 96 near-field destruction bodies high, 48 medium, 24 low, with a separate bounded ragdoll allocation; 8 active rebar joints per nearby building; 8,192 / 2,048 / 512 dust particles; 2 / 1 / 0.5 ms destruction scheduling target. Sleep preserves geometry and collision. Distance reduces simulation detail, never repairs the building or erases salient rubble. During overload defer fracture activation, lower dust/shadows and reduce resolution before compromising gameplay state. The current masonry system's budgets differ and are documented in its implementation note; migration must measure total bodies, including ragdolls and props.

## Bodycam art and TSL effect plan

Art priority is silhouette → human scale → connected space → materials → lighting → animation → restrained lens treatment. Atlanta's skyline needs distinct rooflines and tower setbacks, horizontal office rhythms, rail/viaduct layering, red brick neighborhoods, asphalt cuts and mature street trees. Weathering follows water paths, cracks, exposure and abandonment, not random dirt everywhere. Reflections belong on wet asphalt, puddles, glass and metal; matte rubble must stay matte. Use environment probes plus a limited local planar or SSR path, with explicit fallback and budget.

Target chain: linear HDR scene pass → depth-aware low-light/contrast response → restrained chromatic displacement at edges → subtle rolling-shutter UV offset driven by angular velocity → sensor noise/grain scaled by light level → lens dirt limited to bright glare → vignette → final tone mapping/output color transform. TSL nodes compose this chain; color output is applied once. Camera motion/weapon springs remain CPU transform systems. Effects are adjustable and accessibility can disable motion/distortion. Do not mistake strong distortion, darkness or fog for fidelity.

Default UI aims for roughly 90% of playtime without persistent numeric overlays. Hands, magazine checks, wrist compass, maps, notebooks and radios supply information. Inventory/dialogue/settings and medical inspection remain conventional readable panels when opened. Essential emergency feedback and accessibility exceptions stay explicit. No floating mission marker network. Existing HUD/minimap remains until its replacements are functional; removing information first would worsen the game.

## Tone and original disaster candidates

1. **The Coupling** (recommended): an infrastructure-scale field experiment connects power, water and weather into unstable resonant feedback. Dark precipitation carries persistent conductive contamination. Pros: naturally links anomalies, broken utilities, research and factions; environmental clues can precede exposition. Cons: requires consistent rules and restraint to avoid technobabble.
2. **The Rootfall**: an engineered soil-remediation organism disrupts electricity and alters human/animal physiology. Pros: supports Georgia ecology, overgrowth and resource contamination. Cons: easily becomes generic infection horror; growth timelines need evidence.
3. **The Pressure Divide**: atmospheric intervention creates traveling zones of abnormal pressure, thermal behavior and local gravity. Pros: powerful regional weather/navigation identity. Cons: explaining highly localized artifacts and underground consequences is harder.

Choose the Coupling as provisional canon. Scientists disagree about causes and remedies; Covenant rituals sometimes preserve useful safety knowledge without making every superstition true. Horror is scarcity, uncertain evidence and responsibility. Avoid zombie apocalypse defaults, borrowed lore, comedic gore spectacle, and cheap jump scares.

## Scope and acceptance

The vertical slice is one geographically coherent district and an adjoining wilderness chunk, two fully functioning factions, one three-route mission, trauma/scavenging, one anomaly, one material test building, one pressure-front event and a save/reload round trip. Reuse Last Signal, current wounds, field journal, Rapier, support graph, shells and instancing. The fully artistic landmark city, airport, mountains, large bases and total material destruction are later milestones.

The slice must survive a 30-minute route through combat, dialogue, breach, shelter, trade, save/load and death-to-menu without progression loss. Both rendering backends must preserve readable light/material output. Package installation and first launch must work offline after dependency/assets installation. Performance acceptance requires measured target hardware, representative combat/collapse scenes and frame-time distributions; build success and software-rendered images cannot establish 60 FPS or AAA quality.

## Sources

- [City of Atlanta maps and GIS](https://www.atlantaga.gov/government/departments/city-planning/maps-and-gis), [neighborhood layer](https://gis.atlantaga.gov/dpcd/rest/services/AdministrativeArea/GeopoliticalArea/MapServer/1): geography reference and downloaded boundaries.
- [MARTA official rail map](https://itsmarta.com/uploadedFiles/1008%20x%201224%20Rail%20Map%20%28Ride%20Guide%29%20v2%20112625.pdf): station/network relationships; proposed underground routes are authored.
- [Three.js WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html), [RenderPipeline](https://threejs.org/docs/pages/RenderPipeline.html): backend fallback and node postprocessing.
- [electron-vite guide](https://electron-vite.org/guide/), [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc): target process/build split and narrow bridge.
- [Original destruction breakdown](https://www.reddit.com/r/Unity3D/comments/stzrfb/complete_technical_breakdown_of_the/): linked pieces, load failure and fragment layering; no external implementation copied.

See [development roadmap](DARK_RAIN_ROADMAP.md) for ordered tasks, gates and the five principal risks, and [architecture migration](DARK_RAIN_ARCHITECTURE.md) for exact target scaffolding and workflow. These documents are a design and migration plan, not a claim that the new renderer, ECS, streaming, bases or full fracture authoring already exist.
