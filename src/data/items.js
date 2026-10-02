/**
 * Item database - Define all game items
 */
export const Items = {
    // Medical
    medkit_small: {
        id: 'medkit_small',
        name: 'Small Medkit',
        type: 'medical',
        description: 'A basic first aid kit. Restores a small amount of health.',
        weight: 0.3,
        stackable: false,
        maxStack: 1,
        healAmount: 30,
        useTime: 2,
        icon: 'medkit_small'
    },
    
    medkit_large: {
        id: 'medkit_large',
        name: 'Military Medkit',
        type: 'medical',
        description: 'A comprehensive military-grade medical kit. Restores significant health.',
        weight: 0.5,
        stackable: false,
        maxStack: 1,
        healAmount: 70,
        stopsBleeding: true,
        useTime: 3,
        icon: 'medkit_large'
    },
    
    bandage: {
        id: 'bandage',
        name: 'Bandage',
        type: 'medical',
        description: 'A simple bandage. Stops bleeding and restores minor health.',
        weight: 0.1,
        stackable: true,
        maxStack: 10,
        healAmount: 10,
        stopsBleeding: true,
        useTime: 1.5,
        icon: 'bandage'
    },
    
    antirad: {
        id: 'antirad',
        name: 'Anti-Radiation Drugs',
        type: 'antirad',
        description: 'Pills that help remove radiation from the body.',
        weight: 0.1,
        stackable: true,
        maxStack: 5,
        radiationRemoval: 30,
        useTime: 1,
        icon: 'antirad'
    },
    
    antirad_strong: {
        id: 'antirad_strong',
        name: 'Military Anti-Rad',
        type: 'antirad',
        description: 'Military-grade anti-radiation medicine. Very effective.',
        weight: 0.15,
        stackable: true,
        maxStack: 3,
        radiationRemoval: 60,
        radiationResistance: 0.5,
        duration: 120,
        useTime: 1,
        icon: 'antirad_strong'
    },
    
    // Food & Drink
    bread: {
        id: 'bread',
        name: 'Bread',
        type: 'food',
        description: 'A loaf of stale bread. Not appetizing but filling.',
        weight: 0.3,
        stackable: true,
        maxStack: 5,
        hungerReduction: 20,
        useTime: 2,
        icon: 'bread'
    },
    
    canned_food: {
        id: 'canned_food',
        name: 'Canned Food',
        type: 'food',
        description: 'Tourist Breakfast. A Zone classic.',
        weight: 0.4,
        stackable: true,
        maxStack: 5,
        hungerReduction: 35,
        thirstReduction: 5,
        useTime: 3,
        icon: 'canned_food'
    },
    
    sausage: {
        id: 'sausage',
        name: 'Diet Sausage',
        type: 'food',
        description: 'Questionable meat product. Probably safe to eat.',
        weight: 0.3,
        stackable: true,
        maxStack: 5,
        hungerReduction: 25,
        radiationAmount: 2,
        useTime: 2,
        icon: 'sausage'
    },
    
    vodka: {
        id: 'vodka',
        name: 'Vodka',
        type: 'food',
        description: 'Cossacks Vodka. Reduces radiation but impairs vision.',
        weight: 0.5,
        stackable: true,
        maxStack: 3,
        thirstReduction: -10,
        radiationRemoval: 10,
        useTime: 2,
        effect: 'drunk',
        effectDuration: 60,
        icon: 'vodka'
    },
    
    water_bottle: {
        id: 'water_bottle',
        name: 'Bottled Water',
        type: 'food',
        description: 'Clean drinking water. Essential for survival.',
        weight: 0.5,
        stackable: true,
        maxStack: 5,
        thirstReduction: 40,
        useTime: 1.5,
        icon: 'water_bottle'
    },
    
    energy_drink: {
        id: 'energy_drink',
        name: 'Energy Drink',
        type: 'food',
        description: 'Provides a temporary boost to stamina regeneration.',
        weight: 0.3,
        stackable: true,
        maxStack: 5,
        thirstReduction: 20,
        effect: 'energized',
        effectDuration: 180,
        useTime: 1,
        icon: 'energy_drink'
    },
    
    // Ammunition
    ammo_pistol: {
        id: 'ammo_pistol',
        name: '9x18mm',
        type: 'ammo',
        description: 'Standard pistol ammunition.',
        weight: 0.01,
        stackable: true,
        maxStack: 120,
        ammoType: 'pistol',
        icon: 'ammo_pistol'
    },
    
    ammo_rifle: {
        id: 'ammo_rifle',
        name: '5.45x39mm',
        type: 'ammo',
        description: 'Standard assault rifle ammunition.',
        weight: 0.01,
        stackable: true,
        maxStack: 180,
        ammoType: 'rifle',
        icon: 'ammo_rifle'
    },
    
    ammo_shotgun: {
        id: 'ammo_shotgun',
        name: '12 Gauge',
        type: 'ammo',
        description: 'Shotgun shells. Buckshot.',
        weight: 0.04,
        stackable: true,
        maxStack: 40,
        ammoType: 'shotgun',
        icon: 'ammo_shotgun'
    },
    
    ammo_sniper: {
        id: 'ammo_sniper',
        name: '7.62x54mm',
        type: 'ammo',
        description: 'High-powered sniper rifle ammunition.',
        weight: 0.025,
        stackable: true,
        maxStack: 60,
        ammoType: 'sniper',
        icon: 'ammo_sniper'
    },
    
    // Artifacts
    artifact_moonlight: {
        id: 'artifact_moonlight',
        name: 'Moonlight',
        type: 'artifact',
        description: 'A glowing artifact that slowly heals wounds but emits radiation.',
        weight: 0.5,
        stackable: false,
        rarity: 'rare',
        effects: {
            healthRegen: 0.5,
            radiationEmit: 2
        },
        icon: 'artifact_moonlight'
    },
    
    artifact_soul: {
        id: 'artifact_soul',
        name: 'Soul',
        type: 'artifact',
        description: 'A mysterious artifact that increases endurance.',
        weight: 0.3,
        stackable: false,
        rarity: 'uncommon',
        effects: {
            staminaBonus: 20,
            radiationEmit: 1
        },
        icon: 'artifact_soul'
    },
    
    artifact_battery: {
        id: 'artifact_battery',
        name: 'Battery',
        type: 'artifact',
        description: 'Provides electrical resistance but causes minor bleeding.',
        weight: 0.4,
        stackable: false,
        rarity: 'common',
        effects: {
            electricResist: 0.3,
            bleedChance: 0.05
        },
        icon: 'artifact_battery'
    },
    
    artifact_fireball: {
        id: 'artifact_fireball',
        name: 'Fireball',
        type: 'artifact',
        description: 'Provides thermal resistance. Very radioactive.',
        weight: 0.5,
        stackable: false,
        rarity: 'rare',
        effects: {
            thermalResist: 0.4,
            radiationEmit: 5
        },
        icon: 'artifact_fireball'
    },
    
    // Utility Items
    detector_basic: {
        id: 'detector_basic',
        name: 'Echo Detector',
        type: 'detector',
        description: 'Basic anomaly detector. Beeps when near anomalies.',
        weight: 0.3,
        stackable: false,
        detectorRange: 10,
        canFindArtifacts: false,
        icon: 'detector_basic'
    },
    
    detector_advanced: {
        id: 'detector_advanced',
        name: 'Bear Detector',
        type: 'detector',
        description: 'Advanced detector that can locate artifacts.',
        weight: 0.4,
        stackable: false,
        detectorRange: 15,
        canFindArtifacts: true,
        artifactRange: 20,
        icon: 'detector_advanced'
    },
    
    flashlight: {
        id: 'flashlight',
        name: 'Flashlight',
        type: 'utility',
        description: 'A handheld flashlight. Uses batteries.',
        weight: 0.2,
        stackable: false,
        batteryLife: 300,
        lightRange: 20,
        icon: 'flashlight'
    },
    
    binoculars: {
        id: 'binoculars',
        name: 'Binoculars',
        type: 'utility',
        description: 'Military binoculars for scouting.',
        weight: 0.3,
        stackable: false,
        zoomLevel: 4,
        icon: 'binoculars'
    },
    
    // Quest / Misc Items
    pda: {
        id: 'pda',
        name: 'PDA',
        type: 'quest',
        description: 'A personal digital assistant. Contains valuable information.',
        weight: 0.2,
        stackable: false,
        icon: 'pda'
    },
    
    documents: {
        id: 'documents',
        name: 'Documents',
        type: 'quest',
        description: 'Important documents. Someone might want these.',
        weight: 0.1,
        stackable: true,
        maxStack: 10,
        icon: 'documents'
    },

    // Zone detector - reveals anomalies, second tone marks artifacts
    detector: {
        id: 'detector',
        name: 'Anomaly Detector',
        type: 'tool',
        description: 'A battered military detector. Press N to toggle. Beeps faster near anomalies; a second tone marks artifacts.',
        weight: 0.5,
        stackable: false,
        detectorRange: 18,
        icon: 'detector'
    },

    // Zone artifacts - equip into artifact slots for boons with a price
    artifact_soul: {
        id: 'artifact_soul',
        name: 'Soul',
        type: 'artifact',
        artifactId: 'soul',
        description: 'A warm, pulsing stone. Knits flesh (+0.9 HP/s) while irradiating you (+0.28 rad/s).',
        weight: 0.4,
        stackable: false,
        icon: 'artifact_soul'
    },
    artifact_sparkler: {
        id: 'artifact_sparkler',
        name: 'Sparkler',
        type: 'artifact',
        artifactId: 'sparkler',
        description: 'Bottled lightning. Restores stamina (+7/s) at the cost of radiation (+0.32 rad/s).',
        weight: 0.4,
        stackable: false,
        icon: 'artifact_sparkler'
    },
    artifact_stoneblood: {
        id: 'artifact_stoneblood',
        name: 'Stone Blood',
        type: 'artifact',
        artifactId: 'stoneblood',
        description: 'A clot of the Zone, still warm. Heals fast (+1.8 HP/s). Burns slow (+0.62 rad/s).',
        weight: 0.4,
        stackable: false,
        icon: 'artifact_stoneblood'
    },
    artifact_gravi: {
        id: 'artifact_gravi',
        name: 'Gravi',
        type: 'artifact',
        artifactId: 'gravi',
        description: 'Impossibly dense. +12 kg carry weight. Your teeth ache (+0.5 rad/s).',
        weight: 0.4,
        stackable: false,
        icon: 'artifact_gravi'
    },
    artifact_kolobok: {
        id: 'artifact_kolobok',
        name: 'Kolobok',
        type: 'artifact',
        artifactId: 'kolobok',
        description: 'Round, golden, faintly breathing. +2.6 HP/s and purges radiation (-0.45 rad/s) while feeding more (+0.95 rad/s).',
        weight: 0.4,
        stackable: false,
        icon: 'artifact_kolobok'
    },
    artifact_nightstar: {
        id: 'artifact_nightstar',
        name: 'Night Star',
        type: 'artifact',
        artifactId: 'nightstar',
        description: 'Cold as deep space. +20 kg carry, shields the mind (45% psy resist). Deeply radioactive (+1.25 rad/s).',
        weight: 0.4,
        stackable: false,
        icon: 'artifact_nightstar'
    },
    // === POWERUPS (Dungeon Crawler) ===
    buff_adrenaline: {
        id: 'buff_adrenaline',
        name: 'Adrenaline Shot',
        type: 'buff',
        buffId: 'adrenaline_shot',
        description: '+30% speed, +20% fire rate for 60s. Does not stack.',
        weight: 0.1,
        stackable: true,
        maxStack: 3,
        rarity: 'uncommon',
        icon: 'buff_adrenaline'
    },
    buff_combat_stim: {
        id: 'buff_combat_stim',
        name: 'Combat Stim',
        type: 'buff',
        buffId: 'combat_stim',
        description: '+40% damage for 45s. Does not stack.',
        weight: 0.1,
        stackable: true,
        maxStack: 3,
        rarity: 'uncommon',
        icon: 'buff_combat_stim'
    },
    buff_iron_skin: {
        id: 'buff_iron_skin',
        name: 'Iron Skin Serum',
        type: 'buff',
        buffId: 'iron_skin',
        description: '50% damage reduction for 30s. 5 min cooldown.',
        weight: 0.2,
        stackable: false,
        rarity: 'rare',
        icon: 'buff_iron_skin'
    },
    upgrade_military: {
        id: 'upgrade_military',
        name: 'Military Training Manual',
        type: 'upgrade',
        upgradeId: 'military_training',
        description: 'Permanent +damage (10%/8%/6%). Max 3 stacks.',
        weight: 0.5,
        stackable: false,
        rarity: 'rare',
        icon: 'upgrade_military'
    },
    upgrade_athletic: {
        id: 'upgrade_athletic',
        name: 'Athletic Training Guide',
        type: 'upgrade',
        upgradeId: 'athletic_conditioning',
        description: 'Permanent +speed (10%/8%/6%). Max 3 stacks.',
        weight: 0.5,
        stackable: false,
        rarity: 'rare',
        icon: 'upgrade_athletic'
    },
    artifact_ember: {
        id: 'artifact_ember',
        name: 'Ember Heart',
        type: 'powerup_artifact',
        artifactId: 'ember_heart',
        description: '+25% damage, -10 HP/min. Unequip to stop.',
        weight: 0.3,
        stackable: false,
        rarity: 'epic',
        icon: 'artifact_ember'
    },
    // === EQUIPMENT (Find and Equip) ===
    // Helmets - Head slot
    helmet_cap: {
        id: 'helmet_cap',
        name: 'Baseball Cap',
        type: 'equipment',
        slot: 'head',
        description: '+5% loot detection. Basic head covering.',
        weight: 0.1,
        stackable: false,
        rarity: 'common',
        buffs: { perception: 0.05 },
        icon: 'helmet_cap'
    },
    helmet_military: {
        id: 'helmet_military',
        name: 'Military Helmet',
        type: 'equipment',
        slot: 'head',
        description: '15% headshot damage reduction.',
        weight: 0.8,
        stackable: false,
        rarity: 'uncommon',
        buffs: { headshotResist: 0.15 },
        icon: 'helmet_military'
    },
    helmet_exo: {
        id: 'helmet_exo',
        name: 'Exo Helmet',
        type: 'equipment',
        slot: 'head',
        description: '25% headshot reduction, +10% perception.',
        weight: 1.2,
        stackable: false,
        rarity: 'rare',
        buffs: { headshotResist: 0.25, perception: 0.10 },
        icon: 'helmet_exo'
    },
    // Armor - Body slot
    armor_leather: {
        id: 'armor_leather',
        name: 'Leather Jacket',
        type: 'equipment',
        slot: 'body',
        description: '10% damage resistance.',
        weight: 1.5,
        stackable: false,
        rarity: 'common',
        buffs: { damageResist: 0.10 },
        icon: 'armor_leather'
    },
    armor_military: {
        id: 'armor_military',
        name: 'Military Vest',
        type: 'equipment',
        slot: 'body',
        description: '20% damage resistance.',
        weight: 3.0,
        stackable: false,
        rarity: 'uncommon',
        buffs: { damageResist: 0.20 },
        icon: 'armor_military'
    },
    armor_exo: {
        id: 'armor_exo',
        name: 'Exo Suit',
        type: 'equipment',
        slot: 'body',
        description: '30% damage resist, +20% carry weight.',
        weight: 5.0,
        stackable: false,
        rarity: 'epic',
        buffs: { damageResist: 0.30, carryWeight: 0.20 },
        icon: 'armor_exo'
    },
    // Backpacks - Back slot
    backpack_daypack: {
        id: 'backpack_daypack',
        name: 'Daypack',
        type: 'equipment',
        slot: 'back',
        description: '+8 inventory slots.',
        weight: 0.5,
        stackable: false,
        rarity: 'common',
        buffs: { inventorySlots: 8 },
        icon: 'backpack_daypack'
    },
    backpack_rucksack: {
        id: 'backpack_rucksack',
        name: 'Rucksack',
        type: 'equipment',
        slot: 'back',
        description: '+12 inventory slots.',
        weight: 0.8,
        stackable: false,
        rarity: 'uncommon',
        buffs: { inventorySlots: 12 },
        icon: 'backpack_rucksack'
    },
    backpack_military: {
        id: 'backpack_military',
        name: 'Military Pack',
        type: 'equipment',
        slot: 'back',
        description: '+16 slots, +10% move speed (ergonomic).',
        weight: 1.0,
        stackable: false,
        rarity: 'rare',
        buffs: { inventorySlots: 16, moveSpeed: 0.10 },
        icon: 'backpack_military'
    },
    // === MORE PERMANENT UPGRADES ===
    upgrade_scavenger: {
        id: 'upgrade_scavenger',
        name: 'Scavenger Handbook',
        type: 'upgrade',
        upgradeId: 'scavenger_instinct',
        description: 'Permanent +loot detection (15%/12%/10%). Max 3.',
        weight: 0.3,
        stackable: false,
        rarity: 'uncommon',
        icon: 'upgrade_scavenger'
    },
    upgrade_iron_lungs: {
        id: 'upgrade_iron_lungs',
        name: 'Breathing Techniques Manual',
        type: 'upgrade',
        upgradeId: 'iron_lungs',
        description: 'Permanent +stamina regen (20%/15%/10%). Max 3.',
        weight: 0.3,
        stackable: false,
        rarity: 'uncommon',
        icon: 'upgrade_iron_lungs'
    },
    upgrade_field_medic: {
        id: 'upgrade_field_medic',
        name: 'Field Medic Textbook',
        type: 'upgrade',
        upgradeId: 'field_medic',
        description: 'Permanent +healing (25%/20%/15%). Max 3.',
        weight: 0.4,
        stackable: false,
        rarity: 'rare',
        icon: 'upgrade_field_medic'
    },
    upgrade_night: {
        id: 'upgrade_night',
        name: 'Night Operations Manual',
        type: 'upgrade',
        upgradeId: 'night_vision',
        description: 'Permanent +night vision (30%/25%/20%). Max 3.',
        weight: 0.3,
        stackable: false,
        rarity: 'epic',
        icon: 'upgrade_night'
    },
};

/**
 * Get item by ID
 * @param {string} id - Item ID
 * @returns {Object|null}
 */
export function getItem(id) {
    return Items[id] || null;
}

/**
 * Create item instance from template
 * @param {string} id - Item ID
 * @param {number} count - Stack count
 * @returns {Object|null}
 */
export function createItem(id, count = 1) {
    const template = Items[id];
    if (!template) return null;
    
    return {
        ...template,
        count: template.stackable ? Math.min(count, template.maxStack) : 1,
        condition: 100, // Item durability
        instanceId: `${id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
}

/**
 * Get items by type
 * @param {string} type - Item type
 * @returns {Object[]}
 */
export function getItemsByType(type) {
    return Object.values(Items).filter(item => item.type === type);
}