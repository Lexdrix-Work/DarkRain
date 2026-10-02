import * as THREE from 'three';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

/**
 * Artifact definitions - reality-warped objects formed inside anomaly fields.
 * Every artifact is a bargain: a useful boon paired with a dangerous curse.
 */
export const ARTIFACT_DEFS = {
    soul: {
        id: 'soul',
        name: 'Soul',
        color: 0x39ff88,
        description: 'A warm, pulsing stone. Knits flesh back together while quietly irradiating it.',
        healthRegen: 0.9,
        radiation: 0.28,
        rarity: 30,
        itemId: 'artifact_soul'
    },
    sparkler: {
        id: 'sparkler',
        name: 'Sparkler',
        color: 0x66ccff,
        description: 'Crackles with bottled lightning. Eases the limbs, hums against the skin.',
        staminaRegen: 7.0,
        radiation: 0.32,
        rarity: 26,
        itemId: 'artifact_sparkler'
    },
    stoneblood: {
        id: 'stoneblood',
        name: 'Stone Blood',
        color: 0xff3b5c,
        description: 'A clot of the Zone itself, still warm. Heals fast. Burns slow.',
        healthRegen: 1.8,
        radiation: 0.62,
        rarity: 18,
        itemId: 'artifact_stoneblood'
    },
    gravi: {
        id: 'gravi',
        name: 'Gravi',
        color: 0xb366ff,
        description: 'In impossibly dense. Wearing it makes the world feel lighter. Your teeth ache.',
        carryBonus: 12,
        radiation: 0.5,
        rarity: 12,
        itemId: 'artifact_gravi'
    },
    kolobok: {
        id: 'kolobok',
        name: 'Kolobok',
        color: 0xffb347,
        description: 'Round, golden, faintly breathing. Purges poison while feeding you more of it.',
        healthRegen: 2.6,
        radCleanse: 0.45,
        radiation: 0.95,
        rarity: 8,
        itemId: 'artifact_kolobok'
    },
    nightstar: {
        id: 'nightstar',
        name: 'Night Star',
        color: 0xe8fbff,
        description: 'Cold as deep space. Bends weight and thought alike around the bearer.',
        carryBonus: 20,
        psiShield: 0.45,
        radiation: 1.25,
        rarity: 5,
        itemId: 'artifact_nightstar'
    }
};

const RARITY_TOTAL = Object.values(ARTIFACT_DEFS).reduce((s, d) => s + d.rarity, 0);

/**
 * ArtifactSystem - Spawns, renders, and applies Zone artifacts.
 * Artifacts crystallize at the edges of anomaly fields. A detector's
 * second tone marks them. Effects apply while equipped in artifact slots.
 */
export class ArtifactSystem {
    constructor(game) {
        this.game = game;
        this.scene = null;
        this.artifacts = new Map();
        this.glowTexture = null;
        this.respawnTimer = 0;
        this.maxArtifacts = 14;
        this.beepTimer = 0;
        this.time = 0;
    }

    init(scene) {
        this.scene = scene;
        this.glowTexture = this.makeGlowTexture();
    }

    makeGlowTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    pickDef() {
        let roll = Math.random() * RARITY_TOTAL;
        for (const def of Object.values(ARTIFACT_DEFS)) {
            roll -= def.rarity;
            if (roll <= 0) return def;
        }
        return ARTIFACT_DEFS.soul;
    }

    /**
     * Seed artifacts around existing anomaly fields. Call after anomalies spawn.
     */
    seedArtifacts() {
        const anomalySystem = this.game.anomalySystem;
        if (!anomalySystem || !anomalySystem.anomalies) return;

        for (const anomaly of anomalySystem.anomalies.values()) {
            if (this.artifacts.size >= this.maxArtifacts) break;
            if (Math.random() < 0.4) {
                const angle = Math.random() * Math.PI * 2;
                const dist = anomaly.radius + 1.0 + Math.random() * 1.5;
                const x = anomaly.position.x + Math.cos(angle) * dist;
                const z = anomaly.position.z + Math.sin(angle) * dist;
                this.spawnArtifact(this.pickDef(), x, z);
            }
        }
        console.log(`ArtifactSystem: seeded ${this.artifacts.size} artifacts`);
    }

    spawnArtifact(def, x, z) {
        if (!this.scene || this.artifacts.size >= this.maxArtifacts) return null;

        const wm = this.game.worldManager;
        const y = (wm?.getTerrainHeight ? wm.getTerrainHeight(x, z) : 0) + 0.7;

        const group = new THREE.Group();
        const core = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.22, 0),
            new THREE.MeshStandardMaterial({
                color: 0x111111,
                emissive: def.color,
                emissiveIntensity: 2.2,
                roughness: 0.3,
                metalness: 0.1
            })
        );
        group.add(core);

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.glowTexture,
            color: def.color,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }));
        glow.scale.setScalar(1.6);
        // Never raycast sprites: camera-less raycasts (ground/movement scans)
        // crash on Sprite.raycast when raycaster.camera is unset.
        glow.raycast = () => {};
        group.add(glow);

        group.position.set(x, y, z);
        group.userData.isInteractive = true;
        group.userData.promptText = `Take ${def.name}`;
        const id = `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const artifact = { id, def, mesh: group, core, glow, phase: Math.random() * Math.PI * 2, taken: false };
        group.userData.interactable = {
            id,
            type: 'artifact',
            onInteract: () => this.pickupArtifact(id)
        };
        group.traverse(o => {
            if (o === group) return;
            o.userData.isInteractive = true;
            o.userData.interactable = group.userData.interactable;
            o.userData.promptText = group.userData.promptText;
        });

        this.scene.add(group);
        this.artifacts.set(id, artifact);
        return artifact;
    }

    pickupArtifact(id) {
        const artifact = this.artifacts.get(id);
        if (!artifact || artifact.taken) return;
        artifact.taken = true;

        const inv = this.game.inventorySystem;
        if (inv) inv.addItem(artifact.def.itemId, 1);

        this.scene.remove(artifact.mesh);
        artifact.core.geometry.dispose();
        artifact.core.material.dispose();
        artifact.glow.material.dispose();
        this.artifacts.delete(id);

        globalEventBus.emit('audio:play', { sound: 'artifact_pickup' });
        globalEventBus.emit(GameEvents.NOTIFICATION, {
            message: `Acquired artifact: ${artifact.def.name}`,
            type: 'success',
            duration: 3500
        });
    }

    getEquippedArtifacts() {
        const inv = this.game.inventorySystem;
        if (!inv || !inv.equipment) return [];
        const out = [];
        for (let i = 1; i <= 3; i++) {
            const item = inv.equipment[`artifact${i}`];
            if (item && item.artifactId && ARTIFACT_DEFS[item.artifactId]) {
                out.push(ARTIFACT_DEFS[item.artifactId]);
            }
        }
        return out;
    }

    /** Total psi shielding from equipped artifacts (0..1 fraction). */
    getPsiShield() {
        return Math.min(0.8, this.getEquippedArtifacts().reduce((s, d) => s + (d.psiShield || 0), 0));
    }

    update(deltaTime) {
        const player = this.game.player;
        if (!player) return;
        this.time += deltaTime;

        // Animate
        for (const artifact of this.artifacts.values()) {
            artifact.mesh.position.y += Math.sin(this.time * 2 + artifact.phase) * deltaTime * 0.25;
            artifact.core.rotation.y += deltaTime * 1.2;
            artifact.core.rotation.x += deltaTime * 0.5;
            const pulse = 1.8 + Math.sin(this.time * 3 + artifact.phase) * 0.5;
            artifact.core.material.emissiveIntensity = pulse;
        }

        // Apply equipped effects
        const equipped = this.getEquippedArtifacts();
        let carryBonus = 0;
        for (const def of equipped) {
            if (def.healthRegen) player.heal(def.healthRegen * deltaTime);
            if (def.staminaRegen) {
                player.stats.stamina = Math.min(player.stats.maxStamina,
                    player.stats.stamina + def.staminaRegen * deltaTime);
            }
            if (def.radCleanse) player.removeRadiation(def.radCleanse * deltaTime);
            if (def.radiation) player.addRadiation(def.radiation * deltaTime);
            carryBonus += def.carryBonus || 0;
        }
        const inv = this.game.inventorySystem;
        if (inv) inv.maxWeight = 50 + carryBonus;

        // Detector second tone for nearby artifacts
        const anomalySystem = this.game.anomalySystem;
        if (anomalySystem?.detectorActive) {
            let nearest = Infinity;
            for (const artifact of this.artifacts.values()) {
                const d = player.position.distanceTo(artifact.mesh.position);
                if (d < nearest) nearest = d;
            }
            if (nearest < 45) {
                const norm = nearest / 45;
                const interval = 0.18 + norm * 0.9;
                this.beepTimer += deltaTime;
                if (this.beepTimer >= interval) {
                    this.beepTimer = 0;
                    globalEventBus.emit('audio:play', {
                        sound: 'detector_beep_artifact',
                        volume: 0.4 + (1 - norm) * 0.6
                    });
                    globalEventBus.emit('zone:detector_ping', { distance: nearest, kind: 'artifact' });
                }
            }
        }

        // Slow respawn - the Zone provides
        this.respawnTimer += deltaTime;
        if (this.respawnTimer > 75) {
            this.respawnTimer = 0;
            const anomalySystem2 = this.game.anomalySystem;
            if (anomalySystem2?.anomalies?.size) {
                const list = [...anomalySystem2.anomalies.values()];
                const a = list[Math.floor(Math.random() * list.length)];
                const angle = Math.random() * Math.PI * 2;
                this.spawnArtifact(this.pickDef(),
                    a.position.x + Math.cos(angle) * (a.radius + 1.5),
                    a.position.z + Math.sin(angle) * (a.radius + 1.5));
            }
        }
    }

    /** Remove all artifact meshes (level change) without disposing shared resources. */
    clear() {
        for (const artifact of this.artifacts.values()) {
            this.scene?.remove(artifact.mesh);
            artifact.core.geometry.dispose();
            artifact.core.material.dispose();
            artifact.glow.material.dispose();
        }
        this.artifacts.clear();
    }

    dispose() {
        for (const artifact of this.artifacts.values()) {
            this.scene?.remove(artifact.mesh);
            artifact.core.geometry.dispose();
            artifact.core.material.dispose();
            artifact.glow.material.dispose();
        }
        this.artifacts.clear();
        this.glowTexture?.dispose();
    }
}
