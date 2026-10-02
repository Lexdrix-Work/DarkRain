# Powerup System Design - Dark Rain

## Philosophy
Powerups reward exploration and risk-taking, not grinding. Every powerup has a cost, a cap, or a tradeoff. The goal is meaningful progression without breaking game balance.

## Powerup Categories

### 1. Temporary Buffs (Consumable)
Short-duration effects that don't stack. Using one while active refreshes the timer.

| Name | Effect | Duration | Rarity |
|------|--------|----------|--------|
| Adrenaline Shot | +30% move speed, +20% fire rate | 60s | Uncommon |
| Combat Stim | +40% damage | 45s | Uncommon |
| Iron Skin Serum | 50% damage reduction | 30s | Rare |
| Hunter's Eye | See enemies/loot through walls | 60s | Rare |

**Anti-abuse**: No stacking. Duration refresh only. Limited inventory space.

### 2. Permanent Upgrades (Capped)
Small permanent boosts with hard stacking limits and diminishing returns.

| Name | Effect per Stack | Max Stacks | Total Max |
|------|-----------------|------------|-----------|
| Military Training | +10% / +8% / +6% damage | 3 | +24% |
| Athletic Conditioning | +10% / +8% / +6% move speed | 3 | +24% |
| Body Armor Weave | +10% / +8% / +6% damage resist | 3 | +24% |
| Expanded Pack | +4 inventory slots | 2 | +8 slots |

**Anti-abuse**: Hard caps. Diminishing returns. Rare drops only.

### 3. Artifacts (Risk/Reward)
Found in anomalies. Powerful but dangerous to carry.

| Name | Benefit | Cost |
|------|---------|------|
| Ember Heart | +25% damage | -10 HP/min radiation |
| Frost Core | 30% damage resist | -15% move speed |
| Volt Cell | +35% fire rate | Drains stamina 2x faster |

**Anti-abuse**: Every benefit has a meaningful cost. Can't stack same type.

## Rarity System
- **Common** (gray): Basic supplies
- **Uncommon** (green): Temporary buffs
- **Rare** (blue): Single permanent upgrades, Iron Skin
- **Epic** (purple): Stacked upgrades, powerful artifacts
- **Legendary** (orange): Unique items, one per playthrough

## Acquisition (Risk = Reward)
1. **Anomalies**: Artifacts spawn in anomaly fields (dangerous)
2. **Elite Enemies**: 5% base + 2% per level above player
3. **Safes**: Locked containers in deep city / industrial zones
4. **Quest Rewards**: Major questlines grant one permanent upgrade
5. **Traders**: Can buy Uncommon, never Rare+

## Hard Limits (Anti-Abuse)
1. **Stat Caps**:
   - Damage bonus: max +100% (from all sources)
   - Move speed: max +50%
   - Damage resist: max 75% (multiplicative, never 100%)
   - Fire rate: max +50%

2. **No Infinite Scaling**:
   - Permanent upgrades have max stacks
   - Diminishing returns per stack
   - Legendary items are unique

3. **Economic Controls**:
   - Can't buy Rare+ items
   - Can't sell powerups (no farming economy)
   - Buffs take inventory slots

4. **Temporal Controls**:
   - Buffs don't stack, only refresh
   - Artifact costs are continuous (can't ignore)
   - Cooldowns on powerful consumables (5 min)
