import * as THREE from 'three';

/**
 * ProceduralTextures - Canvas-generated detail textures.
 *
 * The game ships no texture assets, so every surface was a flat
 * MeshStandardMaterial color. These tileable canvas textures add the
 * grain, staining and variation that sells realism at almost zero cost:
 * one 256px canvas per material family, generated once and shared.
 */

function makeCanvas(size = 256) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return [c, c.getContext('2d')];
}

// Deterministic PRNG so the world looks the same every run
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function speckle(ctx, size, rand, count, shades, alphaMin, alphaMax, dotMin, dotMax) {
    for (let i = 0; i < count; i++) {
        const s = shades[Math.floor(rand() * shades.length)];
        ctx.fillStyle = s;
        ctx.globalAlpha = alphaMin + rand() * (alphaMax - alphaMin);
        const d = dotMin + rand() * (dotMax - dotMin);
        ctx.fillRect(rand() * size, rand() * size, d, d);
    }
    ctx.globalAlpha = 1;
}

function stains(ctx, size, rand, count, color, alphaMax, rMin, rMax) {
    for (let i = 0; i < count; i++) {
        const x = rand() * size, y = rand() * size;
        const r = rMin + rand() * (rMax - rMin);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color.replace('A', (rand() * alphaMax).toFixed(3)));
        g.addColorStop(1, color.replace('A', '0'));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
}

function toTexture(canvas, repeat = 1) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

function toBump(canvas, repeat = 1, scale = 1) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    // bump maps are linear data - leave colorSpace unset
    return { tex, scale };
}

const cache = {};

export function getProceduralSet(kind) {
    if (cache[kind]) return cache[kind];
    const builders = { concrete, asphalt, ground, metal, wood, rubble };
    const set = builders[kind] ? builders[kind]() : builders.concrete();
    cache[kind] = set;
    return set;
}

function concrete() {
    const [c, ctx] = makeCanvas();
    const rand = mulberry32(101);
    ctx.fillStyle = '#8a8a86'; ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, rand, 5200, ['#7c7c78', '#96968f', '#83837e', '#9c9c95'], 0.12, 0.35, 1, 3);
    stains(ctx, 256, rand, 14, 'rgba(40,38,34,A)', 0.22, 18, 60);
    stains(ctx, 256, rand, 8, 'rgba(52,60,52,A)', 0.18, 12, 44); // moss hints
    // faint formwork seams
    ctx.strokeStyle = 'rgba(60,60,58,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(256, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 256); ctx.stroke();
    const map = toTexture(c);
    const bump = toBump(c);
    return { map, bumpMap: bump.tex, bumpScale: 0.6 };
}

function asphalt() {
    const [c, ctx] = makeCanvas();
    const rand = mulberry32(202);
    ctx.fillStyle = '#3a3a3c'; ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, rand, 7000, ['#2e2e30', '#464648', '#333336', '#515154'], 0.15, 0.4, 1, 2.5);
    stains(ctx, 256, rand, 10, 'rgba(20,20,20,A)', 0.3, 20, 70);
    // cracks
    ctx.strokeStyle = 'rgba(18,18,20,0.7)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        let x = rand() * 256, y = rand() * 256;
        ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (rand() - 0.5) * 60; y += (rand() - 0.5) * 60; ctx.lineTo(x, y); }
        ctx.stroke();
    }
    return { map: toTexture(c), bumpMap: toBump(c).tex, bumpScale: 0.35 };
}

function ground() {
    const [c, ctx] = makeCanvas();
    const rand = mulberry32(303);
    ctx.fillStyle = '#4a4a38'; ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, rand, 4500, ['#3d3d2e', '#55553f', '#46452f', '#5e5c44', '#3a3f2c'], 0.2, 0.5, 1, 4);
    stains(ctx, 256, rand, 22, 'rgba(58,50,36,A)', 0.35, 14, 52); // dirt patches
    stains(ctx, 256, rand, 12, 'rgba(46,58,34,A)', 0.4, 10, 40);  // grass clumps
    return { map: toTexture(c), bumpMap: toBump(c).tex, bumpScale: 0.8 };
}

function metal() {
    const [c, ctx] = makeCanvas();
    const rand = mulberry32(404);
    ctx.fillStyle = '#5c5f63'; ctx.fillRect(0, 0, 256, 256);
    // brushed streaks
    for (let i = 0; i < 220; i++) {
        ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        const y = rand() * 256;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y + (rand() - 0.5) * 8); ctx.stroke();
    }
    stains(ctx, 256, rand, 16, 'rgba(90,52,26,A)', 0.4, 6, 30); // rust spots
    speckle(ctx, 256, rand, 1500, ['#4c4f53', '#6a6d72'], 0.15, 0.3, 1, 2);
    return { map: toTexture(c), bumpMap: toBump(c).tex, bumpScale: 0.25, metalness: 0.55, roughness: 0.55 };
}

function wood() {
    const [c, ctx] = makeCanvas();
    const rand = mulberry32(505);
    ctx.fillStyle = '#7a5c38'; ctx.fillRect(0, 0, 256, 256);
    // planks
    for (let p = 0; p < 4; p++) {
        const y0 = p * 64;
        ctx.fillStyle = ['#7a5c38', '#83643e', '#6f5333', '#7e6039'][p];
        ctx.fillRect(0, y0, 256, 64);
        // grain lines
        for (let i = 0; i < 26; i++) {
            ctx.strokeStyle = `rgba(60,40,22,${0.12 + rand() * 0.15})`;
            ctx.lineWidth = 1;
            const y = y0 + rand() * 64;
            ctx.beginPath(); ctx.moveTo(0, y);
            ctx.bezierCurveTo(80, y + (rand() - 0.5) * 10, 170, y + (rand() - 0.5) * 10, 256, y);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(30,20,10,0.6)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(256, y0); ctx.stroke();
    }
    stains(ctx, 256, rand, 8, 'rgba(40,28,14,A)', 0.25, 10, 36);
    return { map: toTexture(c), bumpMap: toBump(c).tex, bumpScale: 0.4 };
}

function rubble() {
    const [c, ctx] = makeCanvas();
    const rand = mulberry32(606);
    ctx.fillStyle = '#6e6a62'; ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, rand, 6000, ['#5c5850', '#7e7a70', '#655f55', '#8a8578', '#4e4a43'], 0.2, 0.5, 1, 4);
    stains(ctx, 256, rand, 14, 'rgba(45,42,38,A)', 0.3, 16, 55);
    return { map: toTexture(c), bumpMap: toBump(c).tex, bumpScale: 0.9 };
}

/** Red cross decal for medical crates */
export function makeCrossDecal(size = 0.22) {
    const [c, ctx] = makeCanvas(128);
    ctx.fillStyle = '#e8e6e0'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#c0272d';
    ctx.fillRect(52, 22, 24, 84);
    ctx.fillRect(22, 52, 84, 24);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Return a mesh (plane) so callers can position/rotate it like any decal
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshStandardMaterial({
            map: tex, transparent: true, roughness: 0.6,
            polygonOffset: true, polygonOffsetFactor: -2,
        })
    );
    return mesh;
}
