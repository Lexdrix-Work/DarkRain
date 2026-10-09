# Combat and street detail

## Mechanics

Enemy sight now follows the model's forward direction and checks static cover. Losing sight switches to the last observed location rather than following the player's live position through walls. Ranged and melee attack implementations also check cover before dealing damage.

Player gunfire alerts nearby enemies. An unobstructed report produces a six-second investigation; nearby muffled shots produce a shorter three-second investigation. Hearing stores a fixed location and does not reveal the shooter's current position. Awareness still uses the existing 10 Hz AI update.

Enemy movement respects building footprints and slides along edges. This is a local collision safeguard, not route planning; enemies can still become stuck at complex corners. Hearing range, awareness, and headshot damage need player balance testing.

Head mesh hits deal twice the base damage before existing bonuses and armor. Dead enemies ignore subsequent damage, preventing multiple pellets from repeating death handling. The bright red full-body hit flash was removed. Impact normals are transformed into world space, and shotgun pellet spread follows camera orientation. Empty-fire sounds have a short cooldown. Nearby walls block loot interactions.

## Art

Atlanta storefronts receive striped, supported fabric awnings, rainwater pipes and brackets, utility meters, and vented air conditioners. Alley planters contain narrow grass silhouettes, and streets receive crossing stripes. The fixed geometry joins shared static material batches. Planter boxes enter the collision batch. Detail materials use white base tint after their colors are baked into vertices, avoiding accidental double darkening.

The existing textured brick, asphalt, window maps, lighting, reflection budgets, and separate Three.js upgrade remain in place. This adds environmental detail; procedural buildings, character assets, and animations still need substantial authored art work.

## Verification

- Production build and 33 focused tests passed, including cover, hearing, footprint movement, blocked interactions, head damage, and transformed impact normals.
- Hidden Electron rendering checks inspected street and facade views plus day/night rendering; the sampled city contained 354 visible meshes, and reflections and grounded pickups remained active without application console errors.
- A live desktop shot with fixed aim consumed one round, alerted the enemy, and applied damage. Existing menu, record, training, dialogue, quest reward, and save restoration checks passed afterward.

Offscreen software rendering does not establish hardware performance or full gameplay coverage. No 60 FPS or AAA-fidelity claim is made.
