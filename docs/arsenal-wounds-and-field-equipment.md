# Arsenal, wounds and field equipment — October 7, 2026

This pass implements original tactical handling informed by the user's Battlefield/Hell Let Loose reference, without using their animation data. First-person weapons now have articulated finger chains, opposing thumbs, sleeve forearms, weapon-specific grip positions, support-hand reload paths and trigger motion. Magazine parts follow the support hand during removal and insertion. Charging handles move during the charging phase; the revolver cylinder, bolt-action handle, pump forend and support weapon cover have additional movement. Human enemies layer shooting recoil over their locomotion and rifle support pose, and their muzzle effect comes from the held rifle.

## Additional arsenal

| Weapon | Role | Capacity | Reload time |
|---|---|---:|---:|
| Kestrel 9 Compact | Compact pistol | 15 | 1.8 s |
| Harrier .45 | Heavy pistol | 10 | 2.1 s |
| Ranger .357 | Revolver | 6 | 3.4 s |
| Swift 9 SMG | Fast close-range automatic | 32 | 2.2 s |
| Meridian 5.56 | General-purpose carbine | 30 | 2.35 s |
| Ridgeline .308 | Bolt-action precision rifle | 5 | 3.8 s |
| Marsh 12 Pump | Pump shotgun | 6 | 4.2 s |
| Atlas 7.62 Support | Heavy sustained fire | 60 | 4.6 s |

Each has an individual handling profile with grip targets, reload phase timings, action targets, recoil and balance. They reuse some existing procedural receiver/furniture geometry, with silhouette changes and dedicated revolver/pump builds. New weapons can appear in supply crates, stashes and human corpse loot, and are also available through the developer item giver. Their ammo uses the existing pistol/rifle/shotgun/sniper categories. Weapon ownership and ammo remain covered by the existing save system. Dropping the final inventory copy removes its equipped/owned weapon representation.

## Combat and blood

Base damage increases to pistol 34, rifle 56, shotgun 100 per full pellet spread, sniper 120 and knife 38. Enemy armor now reduces a percentage of each hit, capped at 65%, rather than subtracting a flat value from every pellet. Distance falloff, head hits, perks and player resistance remain active.

Significant sourced injuries add bleeding at up to 3 health/second. Player and enemy wounds tick during gameplay; player wound severity travels in the saved stats. Bandages and the large medkit stop bleeding, while a small medkit heals without treating it. Natural food-based regeneration pauses while bleeding. God mode prevents wound damage, and new sessions clear wounds. The HUD and equipment screen show bleeding status. Legacy infinite status effects now tick instead of being skipped.

Blood uses a 256-droplet pool and up to 64 irregular stains, with ground pools, wall splashes when a nearby collider is behind the hit, wound drips, and a larger death pool. Stains fade after two minutes. No floating flesh-hit planes or independent animation timer per new blood burst are used. Dismemberment and anatomical wound meshes are not implemented.

## Character and equipment

Hair adds shaved, crop, short and long styles with five colors in the creator. Hair is attached to the head and persists through character saves.

The provided equipment picture informed the original layout: equipment cards, an anatomical character preview, carried-weapon list, backpack grid, item description/actions, condition summary and four quick-access buttons. Click selects an item; double-click uses/equips it. Items can be dragged between inventory cells, onto a matching gear slot, or onto quick access. Weapons use keys 1–3; quick access uses 5–8. Quick assignments follow moved items and clear when their final item is removed.

Actual runtime testing exposed and fixed the missing inventory item lookup in EquipmentSystem, unsafe replacement/unequip in a full pack, and the first-open blank preview. Gear and weapon icons now use silhouettes instead of fallback letters.

## Verification and limits

Production build and all 57 tests passed. Hidden Electron rendering exercised all eight additional weapons, grip/reload states, ammo conservation, bleeding loss and bandage treatment, blood caps, equipment actions and the visible inventory menu without application errors. Menu recovery, music, storefront entry and terrain-safe enemy death also passed the existing runtime check. Rendered frames and the equipment screenshot were inspected.

These are procedural first-pass assets and animations, not Battlefield/Hell Let Loose art or animation quality. Finger contacts, shell loading, magazine alignment, scopes and weapon surfaces still need further art/animation refinement. Shell-fed reloads fill the magazine at sequence completion rather than allowing interruption after each shell. The inventory character still holds the shared generic rifle pose. Software rendering does not establish hardware FPS or comprehensive combat balance.
