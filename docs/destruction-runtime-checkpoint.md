# Dark Rain — playable destruction checkpoint, October 8, 2026

Subsequent integrations: [shared breakable-model physics](breakable-model-physics.md) and [physical city fittings and carried debris loads](city-physics-checkpoint.md).

## Try the new building

Launch `release/win-unpacked/Dark Rain.exe`, start a game, press **F1**, and use **Destruction building -> Visit / create**. Close F1 to move and shoot. The fixture is on its own lot outside the generated city's buildings, with a physical foundation pad.

- Shoot the masonry panels to produce fitted irregular fragments and real holes. Loose fragments fall, collide and persist.
- **Charge weak column** damages the compromised rear corner column. Its cached support-demand estimate fails the weak bay connections; connectivity releases that bay under gravity.
- **Charge all supports** removes the columns and ground-floor infill that can physically carry weight. The rest of the building falls; material stays visible/collidable instead of disappearing.
- **Reset building** replaces the fixture rather than appending another copy. Existing ordinary city destruction remains available.
- Normal save/load includes the fixture, failed joint IDs, partial health, exact generated geometry, transforms, velocities, sleeping state and deferred fracture jobs.

## Implemented systems

`DestructionFixture.js` owns the opt-in three-story, 63-piece building, material masses, real Rapier fixed joints, stable IDs and an event journal. It uses the shared typed union-find routine to classify grounded islands after bond damage. Connected unsupported members become dynamic; impacts can break remaining bonds.

Large concrete/brick/wood members can fracture on hard contacts. Collision-start events plus a short pre-impact velocity history handle CCD contacts whose later force report understates the landing. Relative normal speed/effective-mass energy and prototype material thresholds decide secondary fracture; resting contacts do not repeatedly break material. Children retain mass and inherited linear/angular motion, with a correction preserving total linear momentum. Full angular momentum conservation has not been established for this prototype.

Fracture geometry reuses the existing fitted Voronoi slab path rather than replacing a wall with rectangular blocks. Physics hulls use clearance while authoritative mass uses unshrunk visual volume. Meaningful material never times out. Deferred secondary fracture retains its parent body and is saved. This is a single secondary geometry generation, not unlimited recursive material fracture.

The fixture uses a resident-piece cap of 128 (256 on Ultra), with sixteen slots reserved for critical column fractures. Awake targets are 96/192; a supported/sleeping body is not an awake body. Ultra uses denser primary and secondary fragments. These are **fixture settings**, not a completed global city body-pool/admission system. The captured full-collapse run reached 108 awake bodies and exceeded its 96 target; this is a recorded budget failure awaiting further optimization, not a 60-fps certification.

Physics targets participate in player bullets and optimized world sightline queries. `queryCover` provides initial stable candidate records; automatic squad cover repositioning and faction/territory reactions are not implemented for the fixture. Existing combat/AI systems remain in place.

Materials reuse the city's master textures instead of creating duplicate large texture allocations. The existing audio system has a wood break signature; full load creaks, collapse mixing/voice admission and GPU dust remain planned.

## Graphics recovery

Native WebGPU runs encountered device loss/allocation errors during ordinary world startup, before the fixture. A page reload could leave WebGL unavailable in that failed Chromium instance. The desktop recovery path now stops rendering, attempts a dedicated recovery save for an active session and requests a fresh application process with `--darkrain-webgl`. A successful recovery snapshot is resumed using `renderer_recovery`; ordinary autosaves are not overwritten. Browser-only recovery uses a page reload instead.

The command-line switch also supports starting directly with the fallback renderer. The primary WebGPU path remains implemented, but it is **not verified working on this machine for this checkpoint**. GPU recovery cannot guarantee preservation when the filesystem or process itself fails before a snapshot commits. [Electron relaunch lifecycle](https://www.electronjs.org/docs/latest/api/app#apprelaunchoptions)

## Verification and boundaries

- 96 automated tests pass, including the continuous wall-breach -> weak-column -> full-collapse physics sequence, material conservation, floor collision, mid-collapse restoration and a concrete hard-landing fracture test.
- Converted TypeScript checks and production build/package pass.
- An isolated check launches the literal `Dark Rain.exe`, invokes graphics recovery from its menu, and verifies a fresh renderer instance initializes as WebGL2 with a usable menu. This validates the desktop relaunch route; it does not prove recovery from every driver failure or preservation of an active session during an allocation crash.
- Native packaged WebGL2 audit invokes the actual F1 fixture button, captures intact/breached/weak/collapsed/restored frames, saves and reloads through Electron disk storage, and invokes the actual death-menu button. It reports no renderer/runtime errors after the successful fallback run.
- Recorded fixture: 63 intact pieces /95 joints; 103 pieces after local failure, with the affected roof material at approximately 1.17 m above the pad; 118 pieces after full support demolition. Source material mass remains approximately 304,251.87 kg across the captured states and save/load. The rubble minimum piece origin is above the pad; physics tests separately check floor penetration.
- Final full-collapse state has 43 deferred secondary jobs. They keep their parent material rather than deleting it. Geometry is still coarse in several slabs/walls, and native art/collapse presentation needs further work.

The native helper pauses rendering and manually advances physics for reproducible captures; it does **not** measure normal-play FPS or establish a long-playthrough result. GPU compute fracture/dust, reusable body pooling, whole-city fixed-joint conversion, district cascades, full tactical AI, the Step 6 mixer and multiplayer are not completed by this checkpoint. The surrounding game is retained, not replaced with a destruction demo.

Comparison images: [fixture captures](comparisons/2026-10-08-fixture/index.html). Repeatable verifier: `scripts/verify-destruction-fixture.cjs` (`--packaged`, optionally `--darkrain-webgl`).
