# Dark Rain

A S.T.A.L.K.E.R.-inspired survival horror game built with Three.js and Vite. Explore an abandoned,
anomaly-ridden city, manage hunger/thirst/radiation, fight mutants and hostile stalkers, take on
quests, and trade with NPCs.

## Quick start — desktop app (recommended, like Solar Explorer)

```bash
npm install   # installs deps and scaffolds asset/src folders (postinstall)
npm start     # builds and launches the game in its own desktop window (no browser)
npm run dist  # packaged installer + portable exe in release/ (Windows)
```

For development with hot reload:

```bash
npm run dev  # electron-vite opens the existing game with hot reload
```

No browser needed — the game runs in its own window on your GPU.

## Quick start — browser (optional)

```bash
npm run dev:browser  # browser-only Vite server (http://localhost:3000)
npm run build        # main, preload and renderer build into out/
npm run preview:browser # serve out/renderer
```

Use Node 24 LTS for development and tests. Electron 44 and Vite require at least Node 22.12; the tests use native TypeScript stripping available by default in Node 22.18+.

On Windows, you can also double-click `Start Dark Rain.cmd` after installing dependencies.

Run `npm test` for focused collision, interaction, container batching and performance-overlay regression checks.
See `docs/survival-immersion-pass.md` for the new environmental opening, Field Journal (J), skill checks, faction consequences and body-camera controls.

## Project structure

```
index.html
vite.config.js
scripts/setup.cjs        # scaffolds public/assets + src folders
src/
  main/index.ts          # Electron main process and save IPC
  main/SaveStore.ts      # validated atomic filesystem saves
  preload/index.ts      # narrow context-isolated bridge
  render/               # typed WebGPU/TSL rendering and compute
  workers/              # typed terrain generation
  main.js                # retained game entry point
  core/                  # Game, EventBus, InputManager, AssetManager
  entities/              # Entity, Player, Enemy, NPC
  systems/               # Audio, DayNightCycle, Dialogue, Effects, Flashlight,
                         # Inventory, Quest, Save, Survival, Weapon, Weather,
                         # UrbanAnomalySystem
  world/                 # WorldManager, AnomalySystem, CityGenerator,
                         # buildingManager, roadSystem
  ui/                    # UIManager, DialogueUI, Minimap, DebugConsole
  data/                  # items.js
  styles/                # main.css
public/assets/           # textures, models, sounds, fonts (git-ignored except .gitkeep)
```

`src/world/CityGenerator.js`, `buildingManager.js`, `roadSystem.js` and
`src/systems/UrbanAnomalySystem.js` are a standalone alternate city/anomaly pipeline —
kept as optional modules; the live game generates its city through `WorldManager`.

## Controls

- **WASD** move · **Shift** sprint · **Space** jump · **C** crouch
- **Mouse** look · **Click** fire · **R** reload · **1/2/3** weapon slots
- **E** interact · **Tab / I** inventory · **F** flashlight · **M** map
- **F5** quicksave · **F9** quickload · **Esc** pause · **\`** debug console (debug builds)

## Scripts

| Command          | What it does                                       |
|------------------|----------------------------------------------------|
| `npm start`      | Build + launch the desktop app (Electron)          |
| `npm run app`    | Same as `npm start`                                |
| `npm run dist`   | Packaged Windows installer + portable exe (`release/`) |
| `npm run app:dev`| Dev server + desktop app with hot reload           |
| `npm run dev`    | Desktop game with renderer/main/preload hot reload |
| `npm run build`  | Production main/preload/renderer build to `out/` |
| `npm run preview`| Launch the production desktop build |
| `npm run setup`  | Re-create asset/src folder scaffolding             |

## Design and development direction

The game is always named **Dark Rain**. The concept is reviewed against the existing code in [game design](docs/DARK_RAIN_GAME_DESIGN.md), with the [ordered roadmap](docs/DARK_RAIN_ROADMAP.md) and [in-place architecture migration](docs/DARK_RAIN_ARCHITECTURE.md). These distinguish implemented systems from planned WebGPU/TSL, strict TypeScript, ECS and streaming work.

The journal (J) now includes an Atlanta field survey. Official neighborhood geometry guides architectural profiles; current streets/building placement remain compressed procedural approximations rather than an exact city reconstruction.

## Modern foundation

Three.js 0.186.1 uses WebGPURenderer with WebGL2 fallback. The live sky, anomaly surfaces, reflections, material effects and bodycam chain use TSL. Terrain height/color/normal generation runs in a packaged Vite worker. Electron main/preload, save storage, rendering and worker modules use strict TypeScript; legacy gameplay JavaScript remains and is not covered by the strict typecheck.

`npm run check` checks converted TypeScript modules. `npm run perf` starts the desktop game with F3 visible. `npm run clean` removes generated out/dist folders. Desktop saves live in the app user-data saves directory, with recoverable previous files and legacy browser-save import. WebGPU anomaly compute is capability-gated; gameplay hazards retain CPU authority and WebGL2 uses the existing reduced particles.

See [upgrade validation](docs/modern-foundation-upgrade.md) for native checks and remaining hardware validation.
