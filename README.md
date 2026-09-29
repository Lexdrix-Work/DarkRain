# Dark Rain: Pool of Darkness

A S.T.A.L.K.E.R.-inspired survival horror game built with Three.js and Vite. Explore an abandoned,
anomaly-ridden city, manage hunger/thirst/radiation, fight mutants and hostile stalkers, take on
quests, and trade with NPCs.

## Quick start

```bash
npm install   # installs deps and scaffolds asset/src folders (postinstall)
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

| Command          | What it does                              |
|------------------|-------------------------------------------|
| `npm run dev`    | Vite dev server with HMR                  |
| `npm run build`  | Production build to `dist/`               |
| `npm run preview`| Serve the production build                |
| `npm run setup`  | Re-create asset/src folder scaffolding    |
