import * as THREE from 'three';
import { HatFactory } from '../systems/ViewmodelSystem.js';

/**
 * CharacterModel - shared procedural full-body character builder.
 *
 * Used by the character creator preview and the inventory character panel
 * so both show the exact same stalker: hat (HatFactory), skin tone, beard,
 * jacket/arms/pants colors, backpack and shoulder patch. Everything is
 * procedural geometry + canvas textures - no external assets.
 *
 * Character object fields (all optional, normalized with defaults):
 *   name, hat, hatColor, skinTone, sleeveColor, jacketColor, pantsColor,
 *   beard ('none'|'stubble'|'short'|'full'),
 *   backpack ('none'|'daypack'|'rucksack'),
 *   patch ('none'|'stalker'|'trefoil'|'skull'),
 *   eyes ('normal'|'narrow'|'wide'|'tired'), eyeColor,
 *   mouth ('neutral'|'stern'|'grimace'|'smile'),
 *   faceShape ('oval'|'round'|'square'|'narrow'),
 *   bodyShape ('average'|'slim'|'stocky'|'muscular'),
 *   facePaint ('none'|'camo'|'war'|'dirt')
 */

export const BEARD_STYLES = [
    { id: 'none', name: 'Clean' },
    { id: 'stubble', name: 'Stubble' },
    { id: 'short', name: 'Short Beard' },
    { id: 'full', name: 'Full Beard' },
];

export const BACKPACK_STYLES = [
    { id: 'none', name: 'None' },
    { id: 'daypack', name: 'Daypack' },
    { id: 'rucksack', name: 'Rucksack' },
];

export const PATCH_STYLES = [
    { id: 'none', name: 'None' },
    { id: 'stalker', name: 'Stalker' },
    { id: 'trefoil', name: 'Radiation' },
    { id: 'skull', name: 'Skull' },
];

export const EYE_STYLES = [
    { id: 'normal', name: 'Normal' },
    { id: 'narrow', name: 'Narrow' },
    { id: 'wide', name: 'Wide' },
    { id: 'tired', name: 'Tired' },
];

export const EYE_COLORS = [0x4a2e1a, 0x6a4a2a, 0x3a5a3a, 0x3a4a6a, 0x5a5a5a];

export const MOUTH_STYLES = [
    { id: 'neutral', name: 'Neutral' },
    { id: 'stern', name: 'Stern' },
    { id: 'grimace', name: 'Grimace' },
    { id: 'smile', name: 'Smile' },
];

export const FACE_SHAPES = [
    { id: 'oval', name: 'Oval' },
    { id: 'round', name: 'Round' },
    { id: 'square', name: 'Square' },
    { id: 'narrow', name: 'Narrow' },
];

export const BODY_SHAPES = [
    { id: 'average', name: 'Average' },
    { id: 'slim', name: 'Slim' },
    { id: 'stocky', name: 'Stocky' },
    { id: 'muscular', name: 'Muscular' },
];

export const FACE_PAINT_STYLES = [
    { id: 'none', name: 'None' },
    { id: 'camo', name: 'Camo' },
    { id: 'war', name: 'War Stripes' },
    { id: 'dirt', name: 'Dirt' },
];

export const JACKET_COLORS = [0x3a4038, 0x2e3138, 0x4a3b28, 0x39424e, 0x51503e, 0x2b2b2e, 0x5c2e2e];
export const PANTS_COLORS = [0x2e3138, 0x3a3f35, 0x4a4038, 0x232528, 0x3d3a4a, 0x54452e];
export const SKIN_TONES = [0xf0c8a0, 0xdba57e, 0xc9a186, 0x8a5f43, 0x5a3a28];

/** Fill in defaults so old saves (hat/skin/sleeves only) keep working. */
export function normalizeCharacter(c = {}) {
    return {
        name: c.name || 'Stalker',
        hat: c.hat || 'cap',
        hatColor: c.hatColor ?? null,
        skinTone: c.skinTone ?? SKIN_TONES[2],
        sleeveColor: c.sleeveColor ?? 0x4a5240,
        jacketColor: c.jacketColor ?? JACKET_COLORS[0],
        pantsColor: c.pantsColor ?? PANTS_COLORS[0],
        beard: BEARD_STYLES.some(b => b.id === c.beard) ? c.beard : 'none',
        backpack: BACKPACK_STYLES.some(b => b.id === c.backpack) ? c.backpack : 'none',
        patch: PATCH_STYLES.some(p => p.id === c.patch) ? c.patch : 'none',
        eyes: EYE_STYLES.some(e => e.id === c.eyes) ? c.eyes : 'normal',
        eyeColor: c.eyeColor ?? EYE_COLORS[0],
        mouth: MOUTH_STYLES.some(m => m.id === c.mouth) ? c.mouth : 'neutral',
        faceShape: FACE_SHAPES.some(f => f.id === c.faceShape) ? c.faceShape : 'oval',
        bodyShape: BODY_SHAPES.some(b => b.id === c.bodyShape) ? c.bodyShape : 'average',
        facePaint: FACE_PAINT_STYLES.some(f => f.id === c.facePaint) ? c.facePaint : 'none',
    };
}

/* ------------------------------ patch decals ------------------------------ */

function makePatchTexture(patchId) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');

    if (patchId === 'trefoil') {
        // Radiation trefoil: yellow disc, black blades + hub
        x.fillStyle = '#c8a018';
        x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#141414';
        for (const a of [-90, 30, 150]) {
            const r1 = (a - 32) * Math.PI / 180, r2 = (a + 32) * Math.PI / 180;
            x.beginPath();
            x.moveTo(32, 32);
            x.arc(32, 32, 26, r1, r2);
            x.closePath(); x.fill();
        }
        x.fillStyle = '#c8a018';
        x.beginPath(); x.arc(32, 32, 9, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#141414';
        x.beginPath(); x.arc(32, 32, 6, 0, Math.PI * 2); x.fill();
    } else if (patchId === 'skull') {
        x.fillStyle = '#1c1c1e';
        x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#d8d4c8';
        x.beginPath(); x.arc(32, 27, 15, 0, Math.PI * 2); x.fill();
        x.fillRect(22, 32, 20, 12);
        x.fillStyle = '#1c1c1e';
        x.beginPath(); x.arc(26, 26, 4.5, 0, Math.PI * 2); x.fill();
        x.beginPath(); x.arc(38, 26, 4.5, 0, Math.PI * 2); x.fill();
        x.fillRect(30, 33, 4, 5);
        x.fillRect(24, 40, 3, 4); x.fillRect(30, 40, 3, 4); x.fillRect(36, 40, 3, 4);
    } else { // 'stalker' - anomaly swirl badge
        x.fillStyle = '#20242a';
        x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#d8a018'; x.lineWidth = 4;
        x.beginPath(); x.arc(32, 32, 20, 0, Math.PI * 2); x.stroke();
        x.fillStyle = '#d8a018';
        x.beginPath(); x.arc(32, 32, 6, 0, Math.PI * 2); x.fill();
        // swirl arms
        x.strokeStyle = '#d8a018'; x.lineWidth = 3;
        for (const a of [20, 140, 260]) {
            const r = a * Math.PI / 180;
            x.beginPath();
            x.moveTo(32 + Math.cos(r) * 8, 32 + Math.sin(r) * 8);
            x.quadraticCurveTo(32 + Math.cos(r + 0.7) * 20, 32 + Math.sin(r + 0.7) * 20,
                32 + Math.cos(r + 1.4) * 24, 32 + Math.sin(r + 1.4) * 24);
            x.stroke();
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/* ------------------------------ body builder ------------------------------ */

/**
 * Build a full-body stalker (~1.85 units tall) from a character object.
 * @param {Object} character - normalized character choices
 * @param {Object} [opts]
 * @param {boolean} [opts.weapon=true] - include a generic held rifle
 * @returns {THREE.Group} - feet at y=0, facing -Z (camera default)
 */
export function buildCharacterModel(character, opts = {}) {
    const ch = normalizeCharacter(character);
    const withWeapon = opts.weapon !== false;
    const g = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: ch.skinTone, roughness: 0.65 });
    const jacketMat = new THREE.MeshStandardMaterial({ color: ch.jacketColor, roughness: 0.92 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: ch.sleeveColor, roughness: 0.92 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: ch.pantsColor, roughness: 0.95 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 0.8 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.9 });

    /* ---- body shape proportions ---- */
    const bodyMods = {
        average: { torsoW: 1.0, torsoH: 1.0, limbW: 1.0, shoulderW: 1.0 },
        slim: { torsoW: 0.85, torsoH: 1.05, limbW: 0.85, shoulderW: 0.9 },
        stocky: { torsoW: 1.2, torsoH: 0.92, limbW: 1.15, shoulderW: 1.1 },
        muscular: { torsoW: 1.1, torsoH: 1.0, limbW: 1.1, shoulderW: 1.25 },
    };
    const bm = bodyMods[ch.bodyShape] || bodyMods.average;

    /* ---- legs + boots ---- */
    for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * bm.limbW, 0.068 * bm.limbW, 0.72, 12), pantsMat);
        leg.position.set(sx * 0.095, 0.48, 0);
        g.add(leg);
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.26), bootMat);
        boot.position.set(sx * 0.095, 0.065, -0.04);
        g.add(boot);
    }

    /* ---- torso: jacket ---- */
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.205 * bm.torsoW, 0.175 * bm.torsoW, 0.62 * bm.torsoH, 14), jacketMat);
    torso.position.y = 1.12;
    g.add(torso);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.205, 14, 10), jacketMat);
    chest.position.y = 1.42;
    chest.scale.set(bm.shoulderW, 0.55, 0.82);
    g.add(chest);
    // collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 8, 16), jacketMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.5;
    g.add(collar);
    // belt
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.07, 14), darkMat);
    belt.position.y = 0.83;
    g.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.4, metalness: 0.7 }));
    buckle.position.set(0, 0.83, 0.185);
    g.add(buckle);

    /* ---- shoulder patch decal (left shoulder, facing forward) ---- */
    if (ch.patch !== 'none') {
        const patchTex = makePatchTexture(ch.patch);
        const patch = new THREE.Mesh(
            new THREE.PlaneGeometry(0.085, 0.085),
            new THREE.MeshStandardMaterial({ map: patchTex, roughness: 0.85, transparent: true })
        );
        patch.position.set(-0.19, 1.32, 0.115);
        patch.rotation.y = Math.PI; // face -Z (forward)
        patch.rotation.z = 0.15;
        g.add(patch);
    }

    /* ---- arms (sleeves) angled slightly forward, hands skin ---- */
    /* Hierarchical pivots: shoulder -> elbow -> wrist, so segments stay
       connected no matter the pose. */
    for (const sx of [-1, 1]) {
        const arm = new THREE.Group();
        arm.position.set(sx * 0.26, 1.42, 0);
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.058 * bm.limbW, 0.052 * bm.limbW, 0.34, 10), sleeveMat);
        upper.position.y = -0.17;
        arm.add(upper);
        // Elbow pivot at the bottom of the upper arm
        const elbow = new THREE.Group();
        elbow.position.set(0, -0.34, 0);
        elbow.rotation.x = -0.35;
        arm.add(elbow);
        const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * bm.limbW, 0.045 * bm.limbW, 0.3, 10), sleeveMat);
        fore.position.y = -0.15;
        elbow.add(fore);
        // Wrist pivot at the bottom of the forearm
        const wrist = new THREE.Group();
        wrist.position.set(0, -0.3, 0);
        elbow.add(wrist);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skinMat);
        hand.position.y = -0.03;
        wrist.add(hand);
        arm.rotation.z = sx * -0.1;
        arm.rotation.x = -0.25;
        g.add(arm);
    }

    /* ---- head + face (shape modifies proportions) ---- */
    const headY = 1.62;
    const faceMods = {
        oval: { sx: 0.92, sy: 1.05, sz: 0.96 },
        round: { sx: 1.02, sy: 0.95, sz: 0.95 },
        square: { sx: 0.98, sy: 1.0, sz: 0.94 },
        narrow: { sx: 0.84, sy: 1.12, sz: 0.9 },
    };
    const fm = faceMods[ch.faceShape] || faceMods.oval;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 18), skinMat);
    head.position.y = headY;
    head.scale.set(fm.sx, fm.sy, fm.sz);
    g.add(head);
    // square jaw: add angular jaw box
    if (ch.faceShape === 'square') {
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.14), skinMat);
        jaw.position.set(0, headY - 0.08, 0.02);
        g.add(jaw);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), skinMat);
    nose.position.set(0, headY - 0.01, 0.12 * fm.sz);
    g.add(nose);

    /* ---- eyes (style + color) ---- */
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.4 });
    const irisMat = new THREE.MeshStandardMaterial({ color: ch.eyeColor, roughness: 0.3 });
    const eyeStyles = {
        normal: { w: 0.028, h: 0.02, gap: 0.045, y: 0.015 },
        narrow: { w: 0.026, h: 0.012, gap: 0.045, y: 0.015 },
        wide: { w: 0.034, h: 0.026, gap: 0.05, y: 0.018 },
        tired: { w: 0.028, h: 0.014, gap: 0.045, y: 0.012 },
    };
    const es = eyeStyles[ch.eyes] || eyeStyles.normal;
    for (const sx of [-1, 1]) {
        const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), eyeWhiteMat);
        eyeWhite.scale.set(es.w, es.h, 0.012);
        eyeWhite.position.set(sx * es.gap, headY + es.y, 0.108 * fm.sz);
        g.add(eyeWhite);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), irisMat);
        iris.scale.set(es.w * 0.45, es.h * 0.7, 0.008);
        iris.position.set(sx * es.gap, headY + es.y, 0.116 * fm.sz);
        g.add(iris);
        // tired: dark bags under eyes
        if (ch.eyes === 'tired') {
            const bag = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6),
                new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 1 }));
            bag.scale.set(es.w * 1.1, 0.008, 0.01);
            bag.position.set(sx * es.gap, headY + es.y - 0.022, 0.105 * fm.sz);
            g.add(bag);
        }
    }

    /* ---- mouth (style) ---- */
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x6a3a32, roughness: 0.9 });
    const mouthY = headY - 0.062;
    if (ch.mouth === 'neutral') {
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.01), mouthMat);
        mouth.position.set(0, mouthY, 0.112 * fm.sz);
        g.add(mouth);
    } else if (ch.mouth === 'stern') {
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.01, 0.01), mouthMat);
        mouth.position.set(0, mouthY - 0.005, 0.112 * fm.sz);
        mouth.rotation.z = -0.12;
        g.add(mouth);
    } else if (ch.mouth === 'grimace') {
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.012), mouthMat);
        mouth.position.set(0, mouthY, 0.11 * fm.sz);
        g.add(mouth);
        for (const sx of [-1, 1]) {
            const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.008),
                new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 }));
            tooth.position.set(sx * 0.02, mouthY + 0.002, 0.116 * fm.sz);
            g.add(tooth);
        }
    } else if (ch.mouth === 'smile') {
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI), mouthMat);
        mouth.position.set(0, mouthY + 0.008, 0.112 * fm.sz);
        mouth.rotation.z = Math.PI;
        g.add(mouth);
    }

    /* ---- face paint ---- */
    if (ch.facePaint !== 'none') {
        const paintMat = new THREE.MeshStandardMaterial({
            color: ch.facePaint === 'camo' ? 0x3a4a2a : ch.facePaint === 'war' ? 0x1a1a1a : 0x4a3a2a,
            roughness: 1, transparent: true, opacity: 0.85
        });
        if (ch.facePaint === 'camo') {
            for (const [px, py, w] of [[-0.05, 0.02, 0.04], [0.05, 0.01, 0.035], [0, -0.03, 0.05]]) {
                const splotch = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), paintMat);
                splotch.scale.set(w, w * 0.7, 0.008);
                splotch.position.set(px, headY + py, 0.115 * fm.sz);
                g.add(splotch);
            }
        } else if (ch.facePaint === 'war') {
            for (const sx of [-1, 1]) {
                const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.08, 0.008), paintMat);
                stripe.position.set(sx * 0.055, headY + 0.01, 0.11 * fm.sz);
                stripe.rotation.z = sx * 0.15;
                g.add(stripe);
            }
        } else if (ch.facePaint === 'dirt') {
            const smudge = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), paintMat);
            smudge.scale.set(0.07, 0.04, 0.008);
            smudge.position.set(0.02, headY - 0.04, 0.112 * fm.sz);
            g.add(smudge);
        }
    }
    // ears
    for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), skinMat);
        ear.position.set(sx * 0.115, headY, 0);
        ear.scale.set(0.5, 1, 0.7);
        g.add(ear);
    }

    /* ---- beard ---- */
    if (ch.beard !== 'none') {
        const beardMat = new THREE.MeshStandardMaterial({ color: 0x3d2c1e, roughness: 1 });
        const beard = new THREE.Group();
        if (ch.beard === 'stubble') {
            const s = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), beardMat);
            s.position.set(0, headY - 0.055, 0.035);
            s.scale.set(0.88, 0.72, 0.9);
            beard.add(s);
        } else {
            // chin + jaw coverage
            const chin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), beardMat);
            chin.position.set(0, headY - 0.085, 0.055);
            chin.scale.set(0.9, ch.beard === 'full' ? 0.95 : 0.7, 0.85);
            beard.add(chin);
            if (ch.beard === 'full') {
                for (const sx of [-1, 1]) {
                    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), beardMat);
                    cheek.position.set(sx * 0.075, headY - 0.03, 0.075);
                    cheek.scale.set(0.7, 1.1, 0.8);
                    beard.add(cheek);
                }
                const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.03), beardMat);
                mustache.position.set(0, headY - 0.045, 0.115);
                beard.add(mustache);
            } else { // short: chin strap only
                const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 20, Math.PI * 1.2), beardMat);
                strap.position.set(0, headY - 0.05, -0.01);
                strap.rotation.x = Math.PI / 2.4;
                strap.rotation.z = Math.PI * 0.9;
                beard.add(strap);
            }
        }
        g.add(beard);
    }

    /* ---- neck + hat ---- */
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 12), skinMat);
    neck.position.y = 1.5;
    g.add(neck);
    const hat = HatFactory.build(ch.hat, { hatColor: ch.hatColor });
    hat.position.y = headY;
    g.add(hat);

    /* ---- backpack ---- */
    if (ch.backpack !== 'none') {
        const packMat = new THREE.MeshStandardMaterial({
            color: ch.backpack === 'rucksack' ? 0x4a4438 : 0x39424e, roughness: 0.95,
        });
        const pack = new THREE.Group();
        const main = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, ch.backpack === 'rucksack' ? 0.52 : 0.4, 0.17), packMat);
        main.position.y = ch.backpack === 'rucksack' ? 1.14 : 1.16;
        pack.add(main);
        // roll on top
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10),
            new THREE.MeshStandardMaterial({ color: 0x5c5142, roughness: 1 }));
        roll.rotation.z = Math.PI / 2;
        roll.position.y = main.position.y + (ch.backpack === 'rucksack' ? 0.3 : 0.24);
        pack.add(roll);
        // straps over shoulders
        for (const sx of [-1, 1]) {
            const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.02), darkMat);
            strap.position.set(sx * 0.12, 1.3, 0.16);
            strap.rotation.x = 0.25;
            pack.add(strap);
        }
        pack.position.z = 0.26;
        g.add(pack);
    }

    /* ---- generic held rifle (diagonal across chest) ---- */
    if (withWeapon) {
        const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.6 });
        const wood = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.85 });
        const rifle = new THREE.Group();
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.42), gunmetal);
        rifle.add(receiver);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.26), wood);
        stock.position.set(0, -0.02, 0.32);
        rifle.add(stock);
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.22), wood);
        handguard.position.set(0, 0.01, -0.28);
        rifle.add(handguard);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), gunmetal);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.52);
        rifle.add(barrel);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.07), gunmetal);
        mag.position.set(0, -0.1, -0.05);
        mag.rotation.x = 0.3;
        rifle.add(mag);
        rifle.position.set(0.05, 1.02, -0.3);
        rifle.rotation.set(0.15, 0.35, -0.55);
        g.add(rifle);
    }

    return g;
}
