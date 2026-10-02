import * as THREE from 'three';
import { HATS } from '../systems/ViewmodelSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import {
    buildCharacterModel,
    normalizeCharacter,
    BEARD_STYLES,
    BACKPACK_STYLES,
    PATCH_STYLES,
    JACKET_COLORS,
    PANTS_COLORS,
    SKIN_TONES,
    EYE_STYLES,
    EYE_COLORS,
    MOUTH_STYLES,
    FACE_SHAPES,
    BODY_SHAPES,
    FACE_PAINT_STYLES,
} from '../entities/CharacterModel.js';

/**
 * CharacterCreator - pre-game customization screen.
 *
 * Pick a callsign, headgear, hat color, face, skin tone, jacket, sleeves,
 * pants, backpack and shoulder patch. A live 3D preview shows the full body
 * built by the same CharacterModel the inventory panel uses, so what you see
 * is what you get in-game. Choices persist in localStorage and are applied to
 * the FP arms + hat brim.
 */

const HAT_COLORS = [
    { name: 'Standard', color: null }, // per-hat default
    { name: 'Black', color: 0x2e2e30 },
    { name: 'Olive', color: 0x5a5a3a },
    { name: 'Tan', color: 0x8a7a5a },
    { name: 'Gray', color: 0x5a5a5e },
    { name: 'Brown', color: 0x5a3f2a },
];

const SLEEVE_COLORS = [0x4a5240, 0x2e3138, 0x5a3a2a, 0x3a4a5a, 0x6a6a5a, 0x333336];

export class CharacterCreator {
    constructor(game) {
        this.game = game;
        this.ui = game.uiManager;
        this.selection = normalizeCharacter({ name: 'Stalker', sleeveColor: SLEEVE_COLORS[0] });
        this.preview = null; // { renderer, scene, camera, group, raf }
    }

    show() {
        // Start from the saved character if there is one
        const saved = SaveSystem.loadCharacter();
        this.selection = normalizeCharacter(saved || {});
        // Keep the creator's default sleeve palette for legacy saves
        if (saved && saved.sleeveColor === undefined) {
            this.selection.sleeveColor = SLEEVE_COLORS[0];
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

        const optionRow = (elId, options, get, set) => {
            const el = document.getElementById(elId);
            el.innerHTML = '';
            options.forEach((o) => {
                const btn = document.createElement('button');
                btn.className = 'creator-hat-btn' + (get() === o.id ? ' selected' : '');
                btn.textContent = o.name;
                btn.onclick = () => {
                    set(o.id);
                    el.querySelectorAll('.creator-hat-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    this._refreshPreview();
                };
                el.appendChild(btn);
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
        swatchRow('creator-jackets', JACKET_COLORS,
            () => this.selection.jacketColor, (c) => { this.selection.jacketColor = c; }, hex);
        swatchRow('creator-pants', PANTS_COLORS,
            () => this.selection.pantsColor, (c) => { this.selection.pantsColor = c; }, hex);
        optionRow('creator-beards', BEARD_STYLES,
            () => this.selection.beard, (id) => { this.selection.beard = id; });
        optionRow('creator-backpacks', BACKPACK_STYLES,
            () => this.selection.backpack, (id) => { this.selection.backpack = id; });
        optionRow('creator-patches', PATCH_STYLES,
            () => this.selection.patch, (id) => { this.selection.patch = id; });
        optionRow('creator-eyes', EYE_STYLES,
            () => this.selection.eyes, (id) => { this.selection.eyes = id; });
        swatchRow('creator-eye-colors', EYE_COLORS,
            () => this.selection.eyeColor, (c) => { this.selection.eyeColor = c; }, hex);
        optionRow('creator-mouths', MOUTH_STYLES,
            () => this.selection.mouth, (id) => { this.selection.mouth = id; });
        optionRow('creator-faces', FACE_SHAPES,
            () => this.selection.faceShape, (id) => { this.selection.faceShape = id; });
        optionRow('creator-bodies', BODY_SHAPES,
            () => this.selection.bodyShape, (id) => { this.selection.bodyShape = id; });
        optionRow('creator-paints', FACE_PAINT_STYLES,
            () => this.selection.facePaint, (id) => { this.selection.facePaint = id; });
    }

    /* ------------------------------ preview ------------------------------ */

    _startPreview() {
        this._stopPreview();
        const canvas = document.getElementById('creator-canvas');
        if (!canvas) return;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(240, 320, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 240 / 320, 0.01, 20);
        camera.position.set(0, 1.0, 2.9);
        camera.lookAt(0, 0.95, 0);

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
        // Rebuild the full body - same model the inventory panel shows
        while (p.group.children.length) p.group.remove(p.group.children[0]);
        p.group.add(buildCharacterModel(this.selection, { weapon: false }));
    }

    _stopPreview() {
        if (this.preview) {
            cancelAnimationFrame(this.preview.raf);
            this.preview.renderer.dispose();
            this.preview = null;
        }
    }
}
