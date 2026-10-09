# Dark Rain — modern foundation upgrade

7 October 2026. Implemented in the existing project after the user authorized the full foundation upgrade. The separate scaffold was removed; this is the same game, content and systems.

## Delivered

- Three.js **0.186.1**, Electron **44.7.0**, electron-vite **5.0.0**, TypeScript **7.0.2**, Vite **7.3.6**. Vite 8 is newer but incompatible with electron-vite 5's declared peer range; no dependency-force workaround was used.
- WebGPURenderer initializes asynchronously, prefers WebGPU and falls back to WebGL2. The backend is logged. Both use the same TSL materials/effects. A browser query `?backend=webgl` explicitly forces fallback for testing.
- TSL sky/clouds/sun/moon/stars, gravitational/thermal surfaces, color grade/grain/vignette/chroma/bloom/AA, Fresnel glazing, contact shading, material relief and instanced masonry UV scale. Scene-captured environment maps and a node planar puddle retain meaningful reflections. Legacy composer/raw custom shader paths were removed.
- World and first-person weapon compose through explicit render targets before final output conversion. The pipeline is rebuilt after the late-created first-person scene exists. HDR lighting and bloom precede display-space grading and FXAA. The viewmodel pass explicitly clears to transparent and includes transparent effects. This avoids the new renderer's internal output buffer replacing the world during the former depth-clear overlay sequence.
- Three Timer replaces the deprecated Clock; PCFShadowMap replaces removed PCFSoftShadowMap.
- Terrain height, color and normal generation runs in a packaged Vite worker with transferable buffers. It uses the same seeded analytic height function as player/prop placement. A local generation fallback remains available when workers fail. Whole-building generation, streaming, scattering and broader world simulation are still future worker tasks.
- Capability-gated gravitational anomaly compute moves storage-buffer particles on WebGPU. It is visual only; CPU volumes still decide damage and forces. WebGL2 retains its existing lower-count CPU particles. Hardware compute execution is not verified here.
- Strict TypeScript main/preload, desktop contracts, save store/storage, render bootstrap and compute, terrain data/worker/client. Existing gameplay JavaScript is retained and **not covered by the strict typecheck**. This is a modern foundation with incremental gameplay migration, not a claim that every source file is now TypeScript.
- Narrow IPC validates sender/top frame/origin, slot names and payloads. Writes serialize, sync a temporary file, preserve a recoverable previous save and replace the slot. Corrupted latest files can recover the previous valid file. Legacy browser saves are imported without deleting the originals first. Renderer code gets no Node integration or generic filesystem access.
- Success messages occur after save completion; background autosaves run only during a playing session. Continue availability refreshes after durable writes.
- electron-vite builds main/preload/renderer together. Browser development stays available. Windows app packaging points at the new output paths and the worker/assets remain local.

## Commands

```text
npm install
npm run dev       desktop hot reload
npm start         build and launch desktop
npm run build     out/main, out/preload, out/renderer
npm run check     strict converted TypeScript modules
npm test          gameplay, terrain and save regression checks
npm run perf      desktop with F3 visible
npm run clean     remove generated out/dist only
npm run dist      Windows installer and portable targets
npm run dist:dir  unpacked Windows application
npm run dev:browser
```

Node 24 LTS is the recommended development/test runtime. `npm run clean` does not remove user-data saves, source, assets or release artifacts.

## Validation

- Strict typecheck passes; all **92 tests pass**, including new filesystem-save recovery/serialization and worker/placement surface consistency.
- Production main/preload/renderer build succeeds and emits a separate terrain worker asset.
- electron-builder produced `release/win-unpacked/Dark Rain.exe` using Electron 44.7. The local package is unsigned and uses the default icon; signed release distribution is not configured.
- A hidden native Electron audit with a separate test profile loaded the built desktop entry, reached the boot flag, used WebGL2 fallback, saved through the real context-isolated IPC bridge and found the slot on disk. It compared direct/post/weapon composition images; the world remains visible beneath the first-person overlay.
- The same audit loaded the packaged `app.asar` main/renderer/preload paths, reached boot and saved successfully. Worker generation and assets loaded under the packaged archive. This is a package-path smoke check, not a clean-machine installer or long gameplay certification.
- The 8 October native checkpoint reached the menu and world on both WebGPU and forced WebGL2. The packaged WebGPU build completed visible local damage, support damage, full disk save/reload and the death-screen Main Menu button with no renderer console errors. This confirms an available WebGPU adapter in this session; it does not establish adapter identity, compute correctness, broad GPU parity or 60 FPS.
- Native fallback logs retained missing-UV warnings on some geometry and the preexisting missing `weapon_equip` sound warning. Those did not prevent startup/save/render checks, but the asset/UV pipeline still needs refinement. Native screenshots also show the current procedural art and dark street lighting; AAA fidelity is not claimed.

## Next work

Verify WebGPU/compute on the user's GPU and compare day/night/interior/wet scenes and shadows. Profile the new renderer before claiming a performance gain. Convert remaining gameplay boundaries and save records to strict types, stabilize layout versions, add adjacent terrain streaming and staged ECS ownership. Import actual street/parcels/elevation samples and produce stronger authored Atlanta buildings/characters/materials. These remain in the [roadmap](DARK_RAIN_ROADMAP.md).

