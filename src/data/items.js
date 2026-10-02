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
    }
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