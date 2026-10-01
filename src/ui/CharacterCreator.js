import * as THREE from 'three';
import { HATS, HatFactory } from '../systems/ViewmodelSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';

/**
 * CharacterCreator - pre-game customization screen.
 *
 * Pick a callsign, headgear, hat color, skin tone and jacket. A live 3D
 * preview shows the head + hat from the same HatFactory the first-person
 * viewmodel uses, so what you see is what you get when you look down
 * in-game. Choices persist in localStorage and are applied to the FP
 * arms + hat brim.
 */

const HAT_COLORS = [
    { name: 'Standard', color: null }, // per-hat default
    { name: 'Black', color: 0x2e2e30 },
    { name: 'Olive', color: 0x5a5a3a },
    { name: 'Tan', color: 0x8a7a5a },
    { name: 'Gray', color: 0x5a5a5e },
    { name: 'Brown', color: 0x5a3f2a },
];

const SKIN_TONES = [0xf0c8a0, 0xdba57e, 0xc9a186, 0x8a5f43, 0x5a3a28];
const SLEEVE_COLORS = [0x4a5240, 0x2e3138, 0x5a3a2a, 0x3a4a5a, 0x6a6a5a, 0x333336];

export class CharacterCreator {
    constructor(game) {
        this.game = game;
        this.ui = game.uiManager;
        this.selection = {
            name: 'Stalker',
            hat: 'cap',
            hatColor: null,
            skinTone: SKIN_TONES[2],
            sleeveColor: SLEEVE_COLORS[0],
        };
        this.preview = null; // { renderer, scene, camera, group, raf }
    }

    show() {
        // Start from the saved character if there is one
        const saved = SaveSystem.loadCharacter();
        if (saved) {
            this.selection = {
                name: saved.name || 'Stalker',
                hat: saved.hat || 'cap',
                hatColor: saved.hatColor ?? null,
                skinTone: saved.skinTone ?? SKIN_TONES[2],
                sleeveColor: saved.sleeveColor ?? SLEEVE_COLORS[0],
            };
        }
        this.ui.openMenu('creator');
        this._buildSwatches();
        const nameInput = document.getElementById('creator-name');
        if (nameInput) nameInput.value = this.selection.name;
        this._startPreview();

        document.getElementById('creator-begin').onclick = () => this.confirm();
        document.getElementById('creator-back').onclick = () => this.cancel();
    }

    hide() {
        this._stopPreview();
        if (this.ui.activeMenu === 'creator') {
            this.ui.closeMenu('creator', false);
        }
    }

    confirm() {
        const nameInput = document.getElementById('creator-name');
        const name = (nameInput?.value || '').trim().slice(0, 24) || 'Stalker';
        const character = { ...this.selection, name };
        this.hide();
        this.game.applyCharacter(character);
        this.game.beginSession(false);
    }

    cancel() {
        this.hide();
        this.ui.showMainMenu();
    }

    /* ------------------------------ swatches ------------------------------ */

    _buildSwatches() {
        // Hats (buttons with names)
        const hatsEl = document.getElementById('creator-hats');
        hatsEl.innerHTML = '';
        for (const h of HATS) {
            const btn = document.createElement('button');
            btn.className = 'creator-hat-btn' + (this.selection.hat === h.id ? ' selected' : '');
            btn.textContent = h.name;
            btn.onclick = () => {
                this.selection.hat = h.id;
                hatsEl.querySelectorAll('.creator-hat-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this._refreshPreview();
            };
            hatsEl.appendChild(btn);
        }

        const swatchRow = (elId, colors, get, set, cssColor) => {
            const el = document.getElementById(elId);
            el.innerHTML = '';
            colors.forEach((c) => {
                // Compare by the stored value (hat colors store c.color, others store c itself)
                const key = (typeof c === 'object' && c !== null && 'color' in c) ? c.color : c;
                const s = document.createElement('div');
                s.className = 'creator-swatch' + (get() === key ? ' selected' : '');
                s.style.background = cssColor(c);
                s.title = typeof c === 'object' ? c.name : '';
                s.onclick = () => {
                    set(c);
                    el.querySelectorAll('.creator-swatch').forEach(x => x.classList.remove('selected'));
                    s.classList.add('selected');
                    this._refreshPreview();
                };
                el.appendChild(s);
            });
        };

        const hex = (c) => '#' + c.toString(16).padStart(6, '0');
        swatchRow('creator-hat-colors', HAT_COLORS,
            () => this.selection.hatColor, (c) => { this.selection.hatColor = c.color; },
            (c) => c.color === null ? 'linear-gradient(135deg,#666,#999)' : hex(c.color));
        swatchRow('creator-skins', SKIN_TONES,
            () => this.selection.skinTone, (c) => { this.selection.skinTone = c; }, hex);
        swatchRow('creator-sleeves', SLEEVE_COLORS,
            () => this.selection.sleeveColor, (c) => { this.selection.sleeveColor = c; }, hex);
    }

    /* ------------------------------ preview ------------------------------ */

    _startPreview() {
        this._stopPreview();
        const canvas = document.getElementById('creator-canvas');
        if (!canvas) return;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(260, 260, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10);
        camera.position.set(0, 0.06, 0.62);
        camera.lookAt(0, 0.02, 0);

        scene.add(new THREE.HemisphereLight(0xbdc8dd, 0x2a251c, 0.9));
        const key = new THREE.DirectionalLight(0xfff2e0, 1.2);
        key.position.set(0.4, 0.8, 0.6);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
        rim.position.set(-0.5, 0.3, -0.6);
        scene.add(rim);

        const group = new THREE.Group();
        scene.add(group);
        this.preview = { renderer, scene, camera, group, raf: 0 };
        this._refreshPreview();

        const tick = () => {
            if (!this.preview) return;
            group.rotation.y += 0.008;
            renderer.render(scene, camera);
            this.preview.raf = requestAnimationFrame(tick);
        };
        tick();
    }

    _refreshPreview() {
        const p = this.preview;
        if (!p) return;
        // Rebuild the head + shoulders + hat
        while (p.group.children.length) p.group.remove(p.group.children[0]);

        const skinMat = new THREE.MeshStandardMaterial({ color: this.selection.skinTone, roughness: 0.65 });
        const jacketMat = new THREE.MeshStandardMaterial({ color: this.selection.sleeveColor, roughness: 0.9 });

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 18), skinMat);
        head.position.y = 0.02;
        head.scale.set(0.92, 1.05, 0.96);
        p.group.add(head);
        // simple nose hint so rotation reads
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), skinMat);
        nose.position.set(0, 0.01, -0.12);
        p.group.add(nose);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.09, 12), skinMat);
        neck.position.y = -0.12;
        p.group.add(neck);
        const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.2), jacketMat);
        shoulders.position.y = -0.22;
        p.group.add(shoulders);

        const hat = HatFactory.build(this.selection.hat, {
            hatColor: this.selection.hatColor,
        });
        hat.position.y = 0.02;
        p.group.add(hat);
    }

    _stopPreview() {
        if (this.preview) {
            cancelAnimationFrame(this.preview.raf);
            this.preview.renderer.dispose();
            this.preview = null;
        }
    }
}
