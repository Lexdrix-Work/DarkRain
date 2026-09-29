# Dark Rain: Pool of Darkness

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
npm run app:dev  # starts Vite, then opens the game in an Electron window
```

No browser needed — the game runs in its own window on your GPU.

## Quick start — browser (optional)

```bash
npm run dev   # start the dev server (http://localhost:3000)
npm run build # production build into dist/
npm run preview
```

Node 18+ recommended.

## Project structure

```
index.html
vite.config.js
scripts/setup.cjs        # scaffolds public/assets + src folders
src/
  main.js                # StalkerGame entry point
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
| `npm run dev`    | Vite dev server with HMR                           |
| `npm run build`  | Production build to `dist/`                        |
| `npm run preview`| Serve the production build                         |
| `npm run setup`  | Re-create asset/src folder scaffolding             |
