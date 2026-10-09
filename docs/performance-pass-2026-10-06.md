# Performance and reliability pass — October 6, 2026

This pass keeps Three.js r160 and the existing lighting/post-processing chain.

## Changes

- Track invisible debris-pile helpers during city batching so they leave the render scene and are cleaned up with the level.
- Register merged collider chunks using their world-space cell coverage; register ordinary colliders across their bounds and deduplicate query results.
- Use nearby collision geometry for player ground/wall checks. Terrain height remains analytic, and terrain stays available for bullet and AI queries.
- Raycast interactive roots within the player's interaction range rather than the entire rendered city.
- Compact opaque container parts into one mesh per matching shadow configuration. Original materials, UVs and geometry remain; transparent decals keep separate sorting. Root interaction metadata remains intact. Dispose container resources on level clear.
- Measure F3 FPS from actual frame intervals, display CPU work separately, time player/world/physics/render work, and refresh the overlay four times per second. Draw counters include all render passes.
- Use one auto-quality controller and synchronize renderer/composer resolution through the existing render-scale path.
- Launch local Vite and Electron executables directly in the Windows development launcher, avoiding batch-file spawning through `npx.cmd`.

## Validation

Production build passed. Seven focused regression tests passed. A hidden Electron audit booted both original main and the updated game with the minimap, dialogue, artifact, ALife, psy, bolt, dev menu and ragdoll systems present; no renderer errors or unhandled rejections were recorded during the sampled checks.

The sampled 12×12 city had 4,244 meshes before and 1,267 after. Isolated repeated-query measurements were approximately:

| Query | Before | After |
| --- | ---: | ---: |
| Ground | 33.5 ms | 5.6 ms |
| Wall (three rays) | 120.2 ms | 16.2 ms |
| Interaction | 40.0 ms | 0.18 ms |

These are isolated CPU query measurements, not gameplay FPS. Procedural loot variation between runs also affects the exact counts. The street-view canvas captures showed the same city geometry and lighting arrangement; this is a limited rendering check, not a complete visual audit.

The audit used software rendering. Sustained 60 FPS, GPU performance, combat, save/load and every level remain unverified on the developer's hardware. Before/after draw-call values should not be compared directly: the corrected counter now includes the world and post-processing passes instead of just the final overlay pass.

## Hardware check

Launch with `npm start` or `Start Dark Rain.cmd`. Use F3 to inspect FPS, average/p95 frame interval and CPU work while standing, moving, fighting and opening loot containers. Check F1, night weather, collisions away from the city center, and F5/F9 save/load. Keep the pending Three.js upgrade separate from this pass.
