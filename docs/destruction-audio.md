# Dark Rain — Step 6: procedural destruction audio

Next subsystem: [Step 7 — chunk persistence, Electron save flow and A-Life world queries](destruction-persistence.md).

## Scope and signal flow

Design contract following [joint damage/connectivity](destruction-joints.md), [debris management](destruction-debris-manager.md) and [tactical destruction](destruction-tactical-layer.md). The existing `src/systems/AudioManager.js` supplies a Three.js listener, Web Audio context, procedural buffers and music unlock. This proposal adds no runtime audio code. Proposed budgets, thresholds and mix levels below are tuning defaults requiring listening and profiling, not established measurements or guarantees of perceptual audibility.

Contact-force events are not joint reaction measurements. Use the Step 2 cached support-demand estimate until a validated reaction-force binding exists. Audio can reveal a known approximate load; it cannot turn the approximation into a physically measured stress solver. Both hero and standard collapse tiers publish the same semantic events. Standard-tier creaks reflect the known support trigger, not invented per-joint measurements.

```text
Structural load/damage revisions + debris contacts + macro-phase events
  -> bounded deduplicated event queue
  -> listener range / acoustic path / spatial clustering
  -> persistent emitter state + prioritized voice admission
  -> procedural excitation + material resonators + spatialization
  -> stress / break / rumble / contact / dust sub-buses
  -> combat-aware destruction ducking -> SFX/master -> output
Critical combat ------------------------> protected bus ----^
Music / ambience ----------------------> separate ducked buses
```

## 1. Audio event model

Common envelope: `eventId`, simulation tick/time, stable structure/island/shard/joint ID where applicable, source generation, topology revision, world position, velocity for moving emitters, acoustic region, material(s), cause, seed and importance. Physics handles and render slots never identify a sound across saves. Event payloads are numeric values copied out of Rapier callbacks; no retained borrowed event object. Use a bounded ring queue, persistent emitter table and cached generated buffers.

| Event | Additional payload | Audio behavior |
|---|---|---|
| `JointLoadChanged` | force/moment demand and damaged capacities, damage fraction, estimator/measured provenance, validity revision | Update a localized stress emitter; no one-shot per update. |
| `JointFailed` | released energy estimate, bond type, endpoint materials, failure mode | One bond/material crack, then release the corresponding stress emitter. |
| `SurfaceFractured` | material, removed volume, fracture energy, lineage | Local chip/crack/granular layer; shares causal ID with joint failure to avoid duplicate primary attacks. |
| `CollapseStarted/Progress/Ended` | phase, bounds, moving mass, fall height/velocity, major contact energy | Start/update/fade a bounded spatial rumble cluster, not one loop per shard. |
| `DebrisContact` | shard/material pair, contact point/normal, relative normal/tangent speed, impulse, estimated impact energy | Impact or scrape only when a new meaningful contact occurs. |
| `DebrisSettled` / `SupportLost` | final/support pose, previous velocity, support revision | Fade scrape/roll; optional final light tick after actual contact; wake renews motion without replaying the break. |
| `DustEmissionChanged` | emitter bounds, ejected fines rate, phase | Quiet gritty air/fines texture; zero emission fades it. |
| `CriticalCombatCue` | class, priority, expected duration, protected frequency band | Reserve a voice and update destruction/music ducking before scheduled playback. |

Deduplicate by causal event, stable source generation and physics step. Coalesce contacts from the same source pair in a 50 ms window; choose the strongest attack, with a capped energy sum for the granular tail. Never trigger settle foley from every resting contact or from freezing/LOD conversion. Secondary fracture emits its own lineage event; the associated impact remains a single coordinated attack. Visual dust alone is not a loud acoustic emitter.

For distant one-shots, schedule arrival from emission distance / approximately 343 m/s, with a bounded pending queue. A source leaving range is culled, not held for surprise replay. Sustained moving loops follow interpolated emitter positions; already-emitted attacks originate at their emission location. Schedule against AudioContext time using a simulation-to-audio clock mapping. Suspended context/menu/pause resets that mapping and discards obsolete one-shots. Resume continuous stress from current state with a short fade. Reconstruct loops on load; do not replay every historical break. Audio presentation delays never delay physics or AI hearing events.

## 2. Exact load-to-pre-failure mapping

For each valid active joint, consume the current Step 2 demand and **already damage-adjusted** capacity. In the default independent-limit profile:

```text
u = max(compressionDemand / compressionCapacity,
        tensionDemand / tensionCapacity,
        shearDemand / shearCapacity,
        abs(momentDemand) / momentCapacity)
```

Ignore unused channels. An exhausted capacity with nonzero demand is failure, not a division-by-zero audio value. If the structural profile defines a combined interaction envelope, use that exact normalized failure utilization instead of `max`. Never sum values in N, Ns, J and Nm. Collision impulse/energy drives the impact attack and bond damage, not a perpetual stress drone. Do not reduce a capacity by damage again in audio. A falling, disconnected island has rumble/contacts but no fake loaded fixed-joint creak unless it retains actual loaded bonds.

On valid load revision or damage revision, clamp a presentation target `uAudio` to 0–1.2; low-pass with approximately 120 ms rise / 500 ms fall. Audio control runs at 20 Hz over **admitted audible stress clusters**, not all city joints. The structural solver remains event-driven. A still-valid cached load can sustain a stationary creak; support/mass changes invalidate and request a load update. Invalid stale inputs fade over 0.5 seconds unless a confirmed collapse event takes over; never hold stale near-failure noise indefinitely.

Use hysteresis: enter at smoothed utilization 0.60, exit below 0.50 for 0.4 seconds. Let `x = clamp((uAudio - 0.55) / 0.45, 0, 1)` and `s = x*x*(3 - 2*x)`:

| Parameter | Rule before spatial attenuation/ducking |
|---|---|
| Sustained groan gain | Silent outside active state; nominal level `-36 + 18*s` dBFS, referenced to normalized generated content at the reference distance. |
| Micro-creak density | `0.3 + 5*s` pulses/second, capped by cluster admission. |
| Severe slip/crackle layer | Activate above 0.85; intensity `clamp((uAudio - 0.85)/0.15, 0, 1)` with short decaying attacks. |
| Growth accent | Positive change above 0.1 utilization/second adds a capped 0–3 dB accent; stable load never repeatedly triggers it. |
| Material deformation | Utilization increases excitation/roughness and slowly shifts resonant modes; optional ±5% pitch movement, not a universal pitch-rise siren. |

Above 0.90, use more irregular slips and intermittent snaps while retaining the source's identifiable material. A sudden destructive hit may fail immediately: no compulsory pre-warning timer and no delaying gravity to finish a sound. Joint failure cancels scheduled stress pulses, fades the loop in about 30 ms, and triggers the actual break signature. If load redistributes safely, the sound subsides rather than predicting inevitable collapse.

Cluster connected high-utilization joints by material and spatial region (roughly 4–8 m cells). Preserve the worst utilization and a weighted source position; do not multiply volume by joint count. Keep the nearest dangerous support emitter separate where possible. Rank by danger to the listener, utilization, audibility and proximity. Six admitted stress voices cannot represent every joint in a city; they represent the most meaningful local warnings. Collapse warnings remain directional and receive a small protected warning allowance within the critical bus when imminent danger affects the player.

## 3. Material synthesis and debris response

Use cached noise excitations, impulse kernels and modal/filter banks. Vary reproducibly by event seed, member dimensions and material, avoiding repeated identical chirps. “Procedural” means physical parameters control authored/generated acoustic primitives; high-quality original recorded sweeteners can be added later without changing the event contract. No copied game sounds are required.

| Material | Pre-failure | Break/contact signature |
|---|---|---|
| Wood | Fibrous squeaks, bending groan, irregular dry slips | Sharp fiber snap, splinter chatter; dull hollow impacts. |
| Concrete | Low grinding and intermittent aggregate crackle | Heavy crack plus gritty fragments; short low thud on landing. |
| Reinforced concrete | Concrete layer plus restrained steel strain | Crack followed by rebar strain/twang where rebar actually remains or fails. |
| Steel / sheet metal | Resonant groan, bolt slips, panel flex | Bolt pop/metal tear, damped ringing and scraping; size controls modal pitch. |
| Glass | Subtle stress ticks only where useful | Brittle attack, high scattered shard ticks; no bass-heavy masonry explosion. |
| Drywall | Quiet paper/fastener tearing | Soft crush and granular fines; modest level. |
| Brick / mortar | Mortar grit and bond slips | Mortar crumble, discrete hard brick clacks; not glass-like tinkling. |

Scale impact excitation from pre-contact normal relative velocity and effective mass/available collision energy, with a compressed/logarithmic gain curve. For a valid impulse estimate, a bounded `0.5 * normalImpulse * closingNormalSpeed` can approximate impact work; treat that as an estimate, not energy from gravity contacts accumulating forever. Material pair selects the contact response. Tangential motion and sustained contact drive quiet scrapes/rolling; stop below speed/energy thresholds with hysteresis. Larger fragments resonate lower and longer; hollowness and fastening change the profile. Persistent supporting pressure does not produce impact noise. Foley comes from actual collision timing, not predicted flat-ground Y or render disappearance.

Collapse rumble uses band-limited noise and damped low modes centered roughly 35–100 Hz, with 100–300 Hz harmonics for small speakers. High-pass near 25 Hz to remove inaudible/DC energy; cap the low-frequency bus. Envelope follows moving mass/velocity and major landing events, using a soft-knee/log mapping rather than linear mass-to-volume. An airborne roof can sound strained/moving, but its strongest thump occurs on contact. Spatial mid-band grinding and cracks locate the collapse; very low bass supplies weight without replacing directional detail.

Spatial attenuation starts with an inverse-distance panner (example refDistance 4 m / rolloff 1), plus an explicit fade/cull range by event type. A panner's `maxDistance` does not inherently mute beyond that range. Occlusion reduces high frequencies and level using actual remaining walls/portals; an opened breach updates the path. Distant rumble travels farther than fine shard ticks. Reverb sends follow acoustic region and receive the same collapse ducking as the dry signal. No unattenuated stereo bass that makes a distant building sound directly underneath the player.

## 4. Voice and priority budget

Default **48 simultaneously audible semantic voices**, including tails and music/ambience. This is an initial mix/CPU target, not a measured hardware limit. A voice can contain several DSP nodes; profile node/resonator/worklet cost separately. One building and multiple simultaneous buildings share the same budgets:

| Reservation | Voices | Admission rule |
|---|---:|---|
| Critical combat | 16 | Player weapon, incoming shots/near misses, nearby hostile footsteps, immediate threat/collapse warnings and essential dialogue/UI. |
| Structural stress | 6 | Most dangerous/nearby support clusters. |
| Material break attacks | 4 | Strongest nearby primary breaks; merge redundant spatial attacks. |
| Collapse rumble | 4 | At most two per active collapse region; merge distant regions. |
| Debris impact/scrape/settle | 8 | Rank audible energy/proximity; cluster tiny shard contacts. |
| Dust/fines | 2 | Quietest and first to steal. |
| Music/ambient beds | 8 | For example two music stems plus six environmental emitters. |
| **Total** | **48** | Destruction subtotal 24; tails stay counted. |

Critical cues can borrow lower-priority voices without raising the total; destruction never borrows the 16 reserved combat slots. If critical demand itself exceeds capacity, coalesce repeated gunfire/footstep sources and keep the most urgent/nearest events. A hard cap cannot preserve infinitely many separate critical sounds. Reserve some immediately free combat slots under normal load to avoid waiting for a steal fade.

Within a class, score gameplay danger, audibility after distance/occlusion, onset energy, proximity and age. Steal dust, distant ticks and low stress first; preserve a nearby break's initial attack and endangered support warning. Fade a stolen tail over 10–30 ms and only reuse its slot after the fade, unless a free reserved slot is available. Do not overlap hidden stolen tails beyond the cap. Virtual continuous emitters keep state without DSP; re-admission resumes the current phase with a fade, while culled one-shots do not later replay.

Pool metadata, gain/filter/panner chains and cached buffers. Web Audio buffer source nodes are single-use and must be created per scheduled playback; do not claim they can be restarted or that all audio allocation is eliminated. A persistent worklet can synthesize bounded voices later if profiling justifies it; avoid an unnecessary worklet foundation before the existing context/music lifecycle is stable. Use at most eight expensive HRTF panners initially for critical/localized sources; cheaper equal-power panning for other clusters, with region-level reverb sends.

## 5. Mixing rules that protect combat

The destruction mixer cannot promise mathematically that masking never occurs for every listener/device. Its enforceable contract is reserved admission, headroom, priority ducking and tested recognition under worst-case collapse. Never solve this by making everything louder or allowing collapse to push the master compressor into heavy gain reduction.

1. **Separate buses.** Critical combat, threat warnings, destruction sub-buses, ambience and music route separately. Player gunshot body/tail can split so a long weapon tail does not duck the world forever. Honor master/SFX/music/accessibility settings; priorities do not bypass mute. Maintain output headroom with calibrated normalized sources, bus ceilings and a final limiter as a safety stage, not the main mixer.
2. **Duck before critical onset.** Semantic cues schedule gain automation before their audio attack. Starting defaults: reduce destruction 6 dB for nearby weapon/incoming fire, 9–12 dB for threat footsteps or essential speech/warnings; use the strongest current attenuation instead of adding reductions for every shot. Roughly 5–10 ms attack, cue-specific hold 80–200 ms, 200–400 ms release. Rapid fire holds the bounded envelope rather than pumping repeatedly to silence. Preserve limited local structural warning content on the warning bus.
3. **Carve spectrum as well as gain.** Apply up to 6–10 dB extra reduction to destruction in the critical cue's band: roughly 1–4 kHz for speech/footstep definition and 2–6 kHz for shot/near-miss transients. Also duck 60–200 Hz rumble 3–6 dB when it competes with close footstep/weapon body cues. Use broad smooth bands, not aggressive moving notches. Listener/headphone/speaker testing determines final bands.
4. **Control the bed.** Collapse can lower music/ambience 3–6 dB; critical cues lower them further within a bounded envelope. Destruction reverb and delayed returns are ducked too, so a tail cannot fill the space just cleared for a footstep. A music transition never steals a combat slot.
5. **No unnecessary hearing suppression.** Avoid automatic tinnitus/full-band muffling solely because a building collapsed. Any hearing-damage mechanic needs separate gameplay rules and an accessibility option retaining threat cues. Night/dynamic-range mode compresses the spectacle while preserving intelligibility and spatial cues.

Standard `DynamicsCompressorNode` does not expose an external sidechain input. Implement the above semantic ducking with scheduled GainNode/filter AudioParams; if measured audio-driven multiband ducking is later required, use an explicitly designed processor. AudioParam ramps or `setTargetAtTime` smooth transitions; cancel/rebase overlapping automation without discontinuities. Output peak metering checks the master safety stage; a browser compressor alone is not a guaranteed true-peak limiter.

## 6. Implementation and listening gates

Integrate through the existing AudioManager/context, not a second competing listener or context. Preserve user-gesture unlock and music, remove subscriptions on teardown, stop/fade old-world voices on restart/death/menu, and never queue a collapse backlog while suspended. Audio failure must not prevent world startup.

1. Build a load fixture sweeping utilization 0.4 -> 0.95 -> safe, plus immediate failure; verify hysteresis, provenance, stale-load fade and no gravity delay.
2. Verify each material at equal deposited energy and different sizes; audible cracks/contacts must align with actual fracture/ground collision. Check silent resting rubble and wake-on-support-removal.
3. Stress a complete collapse with continuous player fire, an approaching enemy, near misses, a grenade/threat warning and dialogue. Log voices/tails, stolen events, duck envelopes, clipping and audio CPU. Listening tests must identify directions and urgent cues; build success cannot establish that.
4. Repeat with two overlapping collapses, indoors/outdoors, breach occlusion changes, headphones/small speakers, dynamic-range mode and low frame rate. Decouple audio scheduling from render cadence.
5. Verify pause/resume, gesture unlock, death-to-menu, save mid-collapse/reload and native packaged WebGPU/WebGL2 startup. Historical break events must not replay; music and live warnings must still work.

Only after these gates may this design be described as implemented. This document changes no runtime behavior or current performance claims.

API references: [Web Audio spatial panning and distance parameters](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode), [smooth parameter automation](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime), [DynamicsCompressorNode topology](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode), [single-use AudioBufferSourceNode playback](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode).
