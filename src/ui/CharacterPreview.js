import * as THREE from 'three';
import { buildCharacterModel, normalizeCharacter, disposeCharacterModel } from '../entities/CharacterModel.js';

/**
 * CharacterPreview - 3D character panel inside the inventory menu.
 *
 * Shows the player's full-body stalker (hat, colors, beard, backpack,
 * patch, held rifle) next to the inventory grid, plus the callsign and
 * the currently equipped weapon. Rebuilds from game.character every time
 * the inventory opens, so it always matches the character creator.
 *
 * Lifecycle is event-driven: starts on ui:menuOpened{inventory} and stops
 * on ui:menuClosed{inventory} so no renderer runs while the menu is closed.
 */
export class CharacterPreview {
    constructor(game) {
        this.game = game;
        this.ui = game?.uiManager || null;
        this.preview = null; // { renderer, scene, camera, group, raf }

        const bus = this.ui?.eventBus;
        if (bus) {
            bus.on('ui:menuOpened', ({ menu }) => {
                if (menu === 'inventory') this.start();
            });
            bus.on('ui:menuClosed', ({ menu }) => {
                if (menu === 'inventory') this.stop();
            });
        }
    }

    /** Rebuild the model + labels from the current character and weapon. */
    refresh() {
        const p = this.preview;
        if (!p) return;
        while (p.group.children.length) {disposeCharacterModel(p.group.children[0]);p.group.remove(p.group.children[0]);}
        const character = normalizeCharacter(this.game?.character || {});
        p.group.add(buildCharacterModel(character, { weapon: true }));

        const nameEl = document.getElementById('inventory-character-name');
        if (nameEl) nameEl.textContent = character.name || 'Stalker';
        const weaponEl = document.getElementById('inventory-character-weapon');
        if (weaponEl) {
            const w = this.game?.weaponManager?.equippedWeapon;
            weaponEl.textContent = w?.data?.name ? `Equipped: ${w.data.name}` : 'Equipped: Unarmed';
        }
    }

    start() {
        this.stop();
        const canvas = document.getElementById('inventory-character-canvas');
        if (!canvas) return;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(220, 330, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 220 / 330, 0.01, 20);
        camera.position.set(0, 1.0, 2.9);
        camera.lookAt(0, 0.95, 0);

        scene.add(new THREE.HemisphereLight(0xbdc8dd, 0x2a251c, 0.9));
        const key = new THREE.DirectionalLight(0xfff2e0, 1.2);
        key.position.set(0.6, 1.6, 1.2);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
        rim.position.set(-0.8, 0.8, -1.0);
        scene.add(rim);

        const group = new THREE.Group();
        scene.add(group);
        this.preview = { renderer, scene, camera, group, raf: 0 };
        this.refresh();

        const tick = () => {
            if (!this.preview) return;
            group.rotation.y += 0.006;
            renderer.render(scene, camera);
            this.preview.raf = requestAnimationFrame(tick);
        };
        tick();
    }

    stop() {
        if (this.preview) {
            cancelAnimationFrame(this.preview.raf);
            for(const child of this.preview.group.children)disposeCharacterModel(child);
            this.preview.renderer.dispose();
            this.preview = null;
        }
    }
}
