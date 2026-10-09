# Dark Rain

A S.T.A.L.K.E.R.-inspired survival horror game built with Three.js, electron-vite, and TypeScript.  
Explore an abandoned, anomaly-ridden city, manage hunger / thirst / radiation, fight mutants and hostile stalkers, take on quests, and trade with NPCs.

## Quick start (desktop — recommended)

```bash
npm install          # installs deps + scaffolds asset folders
npm start            # production build + launch in its own window
npm run dist         # Windows installer + portable exe → release/
```

**Development with hot reload:**

```bash
npm run dev          # electron-vite desktop (main / preload / renderer HMR)
```

On Windows you can also double-click `Start Dark Rain.cmd` after `npm install`.

## Browser-only (optional)

```bash
npm run dev:browser      # Vite on http://localhost:3000
npm run preview:browser  # serve the browser build
```

**Requirements:** Node 22.12+ (Node 24 LTS preferred). Electron 44 + Vite 7 need at least 22.12.

## Useful commands

| Command | Purpose |
|---------|---------|
| `npm start` / `npm run app` | Build + launch desktop app |
| `npm run dev` | Desktop hot-reload |
| `npm run app:dev` | Alias for desktop hot-reload |
| `npm run build` | Production build → `out/` |
| `npm run dist` | Packaged Windows installer + portable |
| `npm run check` | Type-check converted TypeScript modules |
| `npm run clean` | Remove `out/` and `dist/` |
| `npm run perf` | Desktop with F3 performance overlay visible |
| `npm test` | Focused regression tests |
| `npm run setup` | Re-scaffold asset / src folders |

## Project structure

```
electron.vite.config.ts   # desktop main / preload / renderer
vite.config.js            # browser-only path
tsconfig.json
src/
  main/                   # Electron main + atomic saves (TS)
  preload/                # context-isolated bridge (TS)
  render/                 # WebGPU / TSL rendering
  workers/                # terrain generation workers
  main.js                 # retained gameplay entry
  core/                   # Game, EventBus, Input, Assets
  entities/               # Player, Enemy, NPC, CharacterModel
  systems/                # Weather, Weapon, Inventory, Survival,
                          # Destruction, Ragdoll, Flashlight, …
  world/                  # WorldManager, city, anomalies
  ui/                     # menus, journal, debug, settings
  data/                   # items, geography
  shared/                 # typed contracts
public/assets/            # textures, models, sounds (mostly git-ignored)
docs/                     # design, architecture, roadmap, comparisons
scripts/                  # verification, fixtures, clean, setup
```

## Controls

| Input | Action |
|-------|--------|
| WASD | Move |
| Shift | Sprint |
| Space / C | Jump / Crouch |
| Mouse + Click | Look / Fire |
| R | Reload |
| 1 / 2 / 3 | Weapon slots |
| E | Interact |
| Tab / I | Inventory |
| F | Flashlight |
| M | Map |
| J | Field Journal |
| F5 / F9 | Quicksave / Quickload |
| Esc | Pause |
| F1 | Dev menu |
| F3 | Performance overlay |
| `` ` `` | Debug console (debug builds) |

## Design docs

- [Game design](docs/DARK_RAIN_GAME_DESIGN.md)
- [Roadmap](docs/DARK_RAIN_ROADMAP.md)
- [Architecture migration](docs/DARK_RAIN_ARCHITECTURE.md)
- [Diagnostics & performance](docs/diagnostics-performance.md)
- Comparison screenshots live under `docs/comparisons/` (kept for visual history)

## Modern foundation

- Three.js **0.186.1** — WebGPURenderer + WebGL2 fallback, TSL materials/post
- electron-vite 5 + Electron 44
- Strict TypeScript for main / preload / render / workers
- Rapier physics for destruction & debris
- Capability-gated WebGPU anomaly compute; CPU remains authoritative for hazards
- Desktop saves: validated IPC, atomic replace, recoverable previous files

`npm run check` type-checks the converted modules. Legacy gameplay JS is retained and not under strict type-check yet.

## License

BSD-3-Clause — see [LICENSE](LICENSE).
