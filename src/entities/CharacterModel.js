import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createAnatomicalHead } from './AnatomicalHead.js';
import { buildAnatomicalActor } from './AnatomicalActor.js';
import { applyArmedHumanPose } from '../systems/ArmedHumanPose.js';

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
    { id: 'military_pack', name: 'Military Pack' },
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
        hair:['shaved','crop','short','long'].includes(c.hair)?c.hair:'short',
        hairColor:c.hairColor??0x251e19,
        beard: BEARD_STYLES.some(b => b.id === c.beard) ? c.beard : 'none',
        armor: ['armor_leather','armor_military','armor_exo'].includes(c.armor)?c.armor:'none',
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
 * @returns {THREE.Group} - feet at y=0, facing +Z
 */
export function buildCharacterModel(character, opts = {}) {
    const ch=normalizeCharacter(character);
    const {group}=buildAnatomicalActor({...ch,weapon:opts.weapon!==false,character:ch});
    applyArmedHumanPose(group.animationRig);
    if(opts.weapon===false) {
        for(const side of ['L','R']) {
            const upper=group.animationRig.bones['upperArm'+side],forearm=group.animationRig.bones['forearm'+side];
            upper.quaternion.setFromUnitVectors(forearm.position.clone().normalize(),new THREE.Vector3(side==='L'?-.045:.045,-.25,.01).normalize());
        }
    }
    const widths={average:1,slim:.91,stocky:1.12,muscular:1.06};
    group.scale.x=widths[ch.bodyShape]||1;
    if(ch.patch!=='none') {
        const patch=new THREE.Mesh(new THREE.PlaneGeometry(.05,.05),new THREE.MeshStandardMaterial({map:makePatchTexture(ch.patch),roughness:.95,transparent:true}));
        patch.position.set(-.13,.05,.147);group.animationRig.bones.chest.add(patch);
    }
    group.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
    group.updateMatrixWorld(true);return group;
}

export function disposeCharacterModel(group) {
    const materials=new Set(),textures=new Set();
    group.traverse(o=>{
        if(o.geometry&&!o.geometry.userData.shared)o.geometry.dispose();
        if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);
    });
    for(const m of materials) {
        for(const key of ['map','normalMap','roughnessMap'])if(m[key]&&!m[key].userData.shared)textures.add(m[key]);
        m.dispose();
    }
    for(const t of textures)t.dispose();group.animationRig?.skeleton.dispose();
}
