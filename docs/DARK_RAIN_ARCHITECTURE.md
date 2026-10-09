# Dark Rain — in-place architecture migration

7 October 2026. This is the target scaffold and integration contract for the existing game, **not a second prototype** and not a statement that the migration is complete. Keep the current launch/build functional at each gate. New strict modules replace existing responsibilities one at a time; do not run a parallel second simulation.

## Implemented foundation update

The user authorized the in-place upgrade after this plan was written. Main/preload, save-storage, render bootstrap/TSL effects, anomaly compute and terrain-worker modules now use strict TypeScript. electron-vite builds the SAME existing game into out/main, out/preload and out/renderer; renderer HTML/gameplay source stays in its original locations. Three.js 0.186.1 and Electron 44.7 are installed. Desktop save writes use validated narrow IPC and recoverable file replacement. Legacy gameplay JavaScript is retained and is not strict-typechecked. Streaming/ECS and full gameplay conversion remain future work. See [validation record](modern-foundation-upgrade.md) for practical limits; architecture examples below describe the broader target.

## Versions and compatibility

Official npm registry checks on this date returned Three.js **0.186.1**, TypeScript **7.0.2**, electron-vite **5.0.0**, Electron **44.7.0**, Rapier **0.21.0**, and Vite **8.3.3**. electron-vite 5's declared Vite peer range is 5–7: an installation with Vite 8 rejected the dependency tree. Do not bypass this using force/legacy peer options. Target **Vite 7.3.6**, the current installed compatible version, until electron-vite officially accepts Vite 8 and the app passes migration checks. Newest compatible stable dependencies are the practical interpretation of the brief's newest architecture requirement.

Current game uses Three.js 0.186.1 plus converted TypeScript modules and retained gameplay JavaScript. The aborted separate scaffold was removed; dependencies were upgraded in the root project. Upgrade Three only with rendering, shadows, sky, reflection and post parity checks. Pin runtime versions and commit the dependency lock. Retain the existing electron-builder version until package qualification, rather than mixing another unrelated packaging upgrade into rendering work. Electron 44.7 is a target Chromium distribution; WebGPU availability still needs adapter detection on actual hardware. A version number is not a capability guarantee.

## Target layout

```text
package.json                   # single game, single dependency lock
electron.vite.config.ts        # main/preload/renderer split
tsconfig.main.json             # strict Node/Electron types
tsconfig.preload.json          # strict bridge surface
tsconfig.renderer.json         # strict DOM/worker/TSL game types
src/
  main/index.ts                # window lifecycle, file saves, diagnostics
  preload/index.ts             # narrow context-isolated bridge
  shared/contracts.ts          # SaveEnvelope, settings and diagnostics types
  renderer/
    index.html                 # existing UI migrated with its styles/assets
    main.ts                    # existing StalkerGame entry converted gradually
    core/                      # existing Game/input/event services
    entities/                  # rig/render adapters for ECS identities
    systems/                   # existing systems as authoritative owners
    world/                     # current WorldManager/building/corridor contracts
    ui/                        # existing menus, journal, character/gear panels
    data/geography/            # offline sourced maps and provenance
    render/                    # renderer adapter, TSL sky/material/post modules
    sim/                       # typed columns, systems, stable IDs and clock
    workers/terrain.worker.ts  # pure descriptions/transferable buffers
    assets/                    # glTF, KTX2, original animations/fracture sets
tests/                         # simulation, schema, worker, IPC, regression tests
scripts/                       # clean, launch and qualification helpers
out/main/ out/preload/ out/renderer/
release/
```

Existing source folders need not move before their conversion. First electron-vite config can point renderer input at the existing root index.html and main/preload inputs at current Electron files, keeping package entry/output paths correct. Then move files in small tested steps; update asset URLs and worker paths in the same step. Avoid wholesale file relocation followed by several unrelated rewrites.

Target configuration after migration:

```ts
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';
export default defineConfig({
  main: { build: { rollupOptions: { input: resolve('src/main/index.ts') } } },
  preload: { build: { rollupOptions: { input: resolve('src/preload/index.ts') } } },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
});
```

Set package `main` to `out/main/index.js`. Package `out/**/*` plus runtime dependencies through electron-builder. Production window loads `../renderer/index.html`; preload loads `../preload/index.js`. Dev uses electron-vite's renderer URL, validated as the local dev origin. Keep `nodeIntegration: false`, `contextIsolation: true`, preload sandbox compatibility, and a restrictive packaged content policy. Main process denies untrusted IPC frames and arbitrary external navigation.

## Developer commands

The current executable workflow remains `npm install`, `npm start`; `npm run app:dev` is the existing desktop hot-reload command. `npm run dev` now opens the desktop through electron-vite; `npm run dev:browser` preserves browser development.

After electron-vite and strict modules qualify, the target scripts are:

```json
{
  "dev": "electron-vite dev",
  "start": "electron-vite build && electron-vite preview",
  "build": "electron-vite build",
  "dist": "electron-vite build && electron-builder --win",
  "clean": "node scripts/clean.cjs",
  "check": "tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit && tsc -p tsconfig.renderer.json --noEmit",
  "perf": "electron-vite dev -- --perf",
  "test": "node --test tests/*.test.js"
}
```

Qualification must verify `--perf` reaches main, the read-only bridge exposes the flag, and F3 starts visible in renderer; adjust CLI argument forwarding to the verified installed version. Clean removes only resolved project-owned generated `out`/`dist` paths; never saves, assets or source. Keep aliases for old app/app:dev commands. The two-command acceptance is a fresh checkout/ZIP, `npm install`, `npm run dev`, opening the SAME game without manual flags or missing assets. These are target scripts, deliberately not installed as nonworking placeholder commands.

## Typed bridge and filesystem saves

```ts
export type SaveSlot = 'autosave' | 'quicksave' | 'manual';
export interface SaveEnvelope {
  game: 'Dark Rain';
  schema: number;
  worldLayout: number;
  seed: number;
  savedAt: string;
  chunks: Record<string, unknown>; // replace unknown with versioned records
  simulation: unknown;
  player: unknown;
}
export interface DesktopBridge {
  readonly isDesktop: true;
  readonly perf: boolean;
  saves: {
    list(): Promise<Array<{slot: SaveSlot; savedAt: string}>>;
    read(slot: SaveSlot): Promise<SaveEnvelope | null>;
    write(slot: SaveSlot, data: SaveEnvelope): Promise<void>;
    remove(slot: SaveSlot): Promise<void>;
  };
  settings: { read(): Promise<unknown>; write(data: unknown): Promise<void> };
  diagnostics: { record(data: {kind: string; detail: string}): Promise<void> };
}
```

Use explicit contextBridge methods invoking specific channels, never expose ipcRenderer, filesystem methods, paths or a generic command runner. Runtime validation complements TypeScript: enum slots, schema, finite values, maximum payload sizes, expected game tag, sender window and exact top-level origin. Main derives filenames under the app's user-data directory; renderer never chooses a path. Serialize writes per slot, write/sync a temporary file, rotate a recoverable previous save, then replace destination. Handle interrupted writes and incompatible world-layout versions. Browser uses a bounded IndexedDB adapter with the same SaveEnvelope contract. Migrate legacy localStorage records without deleting them before successful import.

Chunk records use logical entity/cell/container IDs, not transient instance slots or geometry indices. Store destroyed links, material fractures, settled transforms, active velocities, inventories and completed interactions. Save world clock, fronts, faction parties, stock and RNG states. Settings/character appearance belong in separate typed records. Future networking uses authoritative commands/events and stable IDs; file shape alone does not make a game multiplayer-ready.

## ECS and ownership

Choose a lean typed-array ECS for this game's gradual migration, not a new scene-graph entity hierarchy. Capacity expands by bounded slabs. ID is `(index, generation)` so recycled slots cannot target old actors. Columns include Transform(x/y/z/yaw), Velocity, Health, faction ID, simulation tier, weapon state and membership masks. Complex quest/inventory/dialogue data stays sparse and keyed to stable IDs. Render adapters own Three objects; simulation components own gameplay values.

```ts
interface EntityId { index: number; generation: number }
interface SpatialColumns {
  x: Float32Array; y: Float32Array; z: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  alive: Uint8Array; generation: Uint32Array;
}
// query active dense indices; do not scan scene.children for gameplay entities
// destroy increments generation and removes all sparse records/render adapters
```

Start with A-Life party summaries and transient effects, then adapt enemies/NPCs, followed by loot and debris bookkeeping. Keep the existing game systems until each responsibility has one replacement owner. Use integer fixed ticks, event queues and seeded randomness. Agents may plan in workers later; current authoritative world writes and Rapier stepping stay serialized on the simulation thread. Hundreds of agent intentions must not imply hundreds of fully animated, shadow-casting rig instances.

## WebGPU and TSL bootstrap

Three's WebGPURenderer supports a WebGL2 backend fallback; TSL materials and node postprocessing serve both. Compute needs a separate capability-gated fallback. Existing ShaderPass/onBeforeCompile effects must be ported, not assumed compatible.

```ts
import { WebGPURenderer, RenderPipeline, Scene, PerspectiveCamera,
  ACESFilmicToneMapping } from 'three/webgpu';
import { pass, screenUV, uniform, vec4 } from 'three/tsl';
const renderer = new WebGPURenderer({ antialias: true });
await renderer.init();
renderer.toneMapping = ACESFilmicToneMapping;
const scene = new Scene();
const camera = new PerspectiveCamera(72, innerWidth / innerHeight, .05, 750);
const scenePass = pass(scene, camera);
const beauty = scenePass.getTextureNode();
const motion = uniform(0); // update from measured camera angular velocity
const uv = screenUV.add(vec4(motion.mul(screenUV.y.sub(.5)), 0, 0, 0).xy);
const sampled = beauty.sample(uv);
const edge = screenUV.sub(.5).length().smoothstep(.25, .7);
const output = sampled.rgb.mul(edge.mul(.12).oneMinus());
const pipeline = new RenderPipeline(renderer);
pipeline.outputNode = vec4(output, sampled.a);
// renderer.setAnimationLoop(() => { fixedSim.advance(); pipeline.render(); });
```

This is the initial composition shape, not the complete effect implementation or a tested drop-in for the old Game class. Typecheck and runtime-compile it against pinned r186 before integration. Port existing lighting/output behavior first. Then add restrained grain, low-light noise, chromatic offsets, lens dirt/glare, and depth-aware response as separately switchable nodes. Avoid multiple final output transforms. Keep fixed-resolution UI out of dynamic-resolution scene textures. Shadow and reflection methods must be measured on both backends. Forced WebGL2 is a supported test mode, not an error to hide.

GPU anomaly storage schema: per-particle position/lifetime plus velocity/seed. A TSL compute Fn indexes storage by instanceIndex, integrates analytic field forces, respawns expired particles and writes positions; rendering instance vertices reads the same buffer. Count and workgroup limits derive from capability/quality. WebGL2 renders fewer instances using analytic time functions or worker-updated buffers. Terrain/scatter compute can follow after worker generation and seed/seam parity are proven. Main thread receives only gameplay field definitions, not particle readbacks each frame.

## Worker terrain and streaming pipeline

```ts
import TerrainWorker from './workers/terrain.worker?worker';
const worker = new TerrainWorker();
worker.postMessage({ kind: 'generate', request: 1, seed: 1337,
  chunk: [0, 1], resolution: 65, lod: 0, layoutVersion: 2 });
// worker returns typed height/normal/biome/scatter buffers and logical IDs
// postMessage(reply, [heights.buffer, normals.buffer, scatter.buffer]);
```

Pure coordinate noise samples GLOBAL coordinates so adjacent chunks share edge heights. Store a fixed origin/units/projection version. LOD neighbors need skirts or matched edge topology and conservative collision meshes; never use a visual skirt as the ground collision. Worker output contains no DOM, materials, Meshes or Rapier instances. Main thread prioritizes visible/near requests, ignores stale request/version responses, uploads within a frame budget and constructs/render-batches entities. Generation cancellation avoids building chunks after the player has left. OffscreenCanvas is useful for procedural texture preparation when supported, with a portable worker/offline asset alternative.

Near collision uses Rapier heightfields/trimeshes consistent with visible ground. Fixed 60 Hz stepping, bounded accumulator and interpolated transforms. Character-controller movement remains authoritative; do not introduce a second naive movement path. Sleeping debris becomes instanced static geometry plus bounded collider islands; a local disturbance can reactivate selected pieces. Chunk unload must serialize all changed state and active motion before freeing bodies/resources.

## Asset and art contracts

glTF models use metres, declared pivot conventions, collision hulls, skin bind poses, weapon grips and LODs. KTX2/Basis textures carry correct sRGB/linear flags, mipmaps, measured roughness/normal strength and shared material IDs. Meshopt/Draco decoding loads locally in packaged builds and workers where practical. Generate fracture sets offline with face/interior materials and hulls. Keep source licenses/provenance in the repository, not as disruptive gameplay UI. Original procedural content stays useful where its quality is sufficient. Terrain illustration must never be labeled surveyed elevation.

Compression and batching improve memory/bandwidth/draw submission; they do not make low-quality source assets realistic. Parallax is confined to appropriate surfaces; real openings, silhouettes and broken wall edges require geometry. Planar reflections are reserved for meaningful wet surfaces with throttled updates, while probes/roughness handle most materials.

## Qualification order

Types/saves → generation workers and bounded uploads → ECS ownership → renderer compatibility prototype inside current app → TSL parity → anomaly compute → material fracture/art → packaged vertical slice. Each gate includes old saves and browser fallback. Add performance measurements only on actual user hardware. See the roadmap for concrete tasks and the design document for gameplay contracts.
