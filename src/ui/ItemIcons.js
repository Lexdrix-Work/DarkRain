/**
 * ItemIcons.js — procedural 2D sprite icons for every inventory item.
 *
 * Each icon is drawn on an offscreen canvas with the 2D API (no image
 * assets) and cached as a data URL. Call ItemIcons.get(iconId) to get
 * the data URL for an item's `icon` field.
 */
const SIZE = 64;
const cache = new Map();

function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    return [c, c.getContext('2d')];
}

function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function cross(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - s / 6, cy - s / 2, s / 3, s);
    ctx.fillRect(cx - s / 2, cy - s / 6, s, s / 3);
}

function radiationTrefoil(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a - 0.5, a + 0.5);
        ctx.closePath();
        ctx.fill();
    }
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.25, 0, 7); ctx.fill();
}

function glowOrb(ctx, cx, cy, r, inner, outer) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
}

function bullet(ctx, x, y, h, casing, tip) {
    ctx.fillStyle = casing;
    ctx.fillRect(x, y + h * 0.35, 10, h * 0.65);
    ctx.fillStyle = tip;
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.35);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x + 10, y + h * 0.35);
    ctx.closePath(); ctx.fill();
}

function bottle(ctx, x, y, w, h, liquid, label) {
    ctx.fillStyle = 'rgba(200,220,235,0.9)';
    rr(ctx, x + w * 0.25, y, w * 0.5, h * 0.18, 3); ctx.fill();
    rr(ctx, x, y + h * 0.15, w, h * 0.85, 6); ctx.fill();
    ctx.fillStyle = liquid;
    rr(ctx, x + 3, y + h * 0.45, w - 6, h * 0.5, 4); ctx.fill();
    if (label) {
        ctx.fillStyle = '#f5f2e8';
        ctx.fillRect(x + 4, y + h * 0.55, w - 8, h * 0.22);
    }
}

const painters = {
    grenade(ctx){ctx.fillStyle='#64704e';ctx.beginPath();ctx.ellipse(31,37,13,18,-.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#aaa58c';ctx.fillRect(26,12,11,9);ctx.strokeStyle='#b2b3a5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(35,15);ctx.lineTo(44,27);ctx.lineTo(43,39);ctx.stroke();ctx.beginPath();ctx.arc(23,15,5,0,Math.PI*2);ctx.stroke();},
    knife(ctx){ctx.fillStyle='#545849';ctx.fillRect(27,38,9,20);ctx.fillStyle='#b9bdb6';ctx.beginPath();ctx.moveTo(27,38);ctx.lineTo(28,13);ctx.lineTo(35,5);ctx.lineTo(37,38);ctx.closePath();ctx.fill();ctx.fillStyle='#747871';ctx.fillRect(23,37,18,4);},
    crowbar(ctx){ctx.strokeStyle='#888c8b';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(20,55);ctx.lineTo(35,17);ctx.quadraticCurveTo(40,6,49,15);ctx.stroke();},
    fireaxe(ctx){ctx.fillStyle='#927044';ctx.save();ctx.translate(32,32);ctx.rotate(.45);ctx.fillRect(-3,-22,6,49);ctx.fillStyle='#acafa7';ctx.beginPath();ctx.moveTo(-4,-22);ctx.lineTo(16,-27);ctx.lineTo(17,-10);ctx.lineTo(-4,-14);ctx.closePath();ctx.fill();ctx.restore();},
    sledgehammer(ctx){ctx.save();ctx.translate(32,32);ctx.rotate(.4);ctx.fillStyle='#947444';ctx.fillRect(-3,-20,6,48);ctx.fillStyle='#6e7575';rr(ctx,-17,-23,34,13,3);ctx.fill();ctx.restore();},
    medkit_small(ctx) {
        ctx.fillStyle = '#b03030'; rr(ctx, 12, 18, 40, 30, 6); ctx.fill();
        ctx.fillStyle = '#7c1f1f'; rr(ctx, 12, 18, 40, 8, 4); ctx.fill();
        cross(ctx, 32, 33, 20, '#fff');
    },
    medkit_large(ctx) {
        ctx.fillStyle = '#b03030'; rr(ctx, 8, 12, 48, 40, 8); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; rr(ctx, 8, 12, 48, 40, 8); ctx.stroke();
        cross(ctx, 32, 32, 26, '#fff');
    },
    bandage(ctx) {
        ctx.fillStyle = '#d9b98a'; rr(ctx, 8, 24, 48, 16, 8); ctx.fill();
        ctx.fillStyle = '#efe0c0'; rr(ctx, 24, 26, 16, 12, 3); ctx.fill();
        ctx.fillStyle = '#b89468';
        for (const x of [14, 46]) { ctx.beginPath(); ctx.arc(x, 32, 2, 0, 7); ctx.fill(); }
    },
    antirad(ctx) {
        bottle(ctx, 18, 10, 28, 46, '#e8c832', false);
        ctx.fillStyle = '#222'; ctx.fillRect(24, 6, 16, 8);
        radiationTrefoil(ctx, 32, 36, 10, '#222');
    },
    antirad_strong(ctx) {
        bottle(ctx, 18, 10, 28, 46, '#e07820', false);
        ctx.fillStyle = '#222'; ctx.fillRect(24, 6, 16, 8);
        radiationTrefoil(ctx, 32, 36, 11, '#111');
        ctx.strokeStyle = '#ffdf40'; ctx.lineWidth = 2; rr(ctx, 18, 10, 28, 46, 6); ctx.stroke();
    },
    bread(ctx) {
        ctx.fillStyle = '#a06a35';
        ctx.beginPath(); ctx.ellipse(32, 34, 22, 13, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#c08a4a';
        ctx.beginPath(); ctx.ellipse(32, 30, 18, 9, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#7c4f22'; ctx.lineWidth = 2;
        for (const x of [24, 32, 40]) {
            ctx.beginPath(); ctx.moveTo(x - 4, 26); ctx.lineTo(x + 4, 32); ctx.stroke();
        }
    },
    canned_food(ctx) {
        ctx.fillStyle = '#b9bec4'; rr(ctx, 20, 14, 24, 38, 4); ctx.fill();
        ctx.fillStyle = '#8f959c'; ctx.fillRect(20, 14, 24, 6);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(22, 26, 20, 14);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif';
        ctx.fillText('FOOD', 24, 36);
    },
    sausage(ctx) {
        ctx.strokeStyle = '#8a4f28'; ctx.lineWidth = 12; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(32, 30, 16, 0.4, Math.PI * 1.4); ctx.stroke();
        ctx.strokeStyle = '#a86a3a'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(32, 30, 16, 0.4, Math.PI * 1.4); ctx.stroke();
    },
    vodka(ctx) {
        bottle(ctx, 20, 8, 24, 48, 'rgba(220,235,245,0.55)', true);
        ctx.fillStyle = '#2a4a6a'; ctx.font = 'bold 7px sans-serif';
        ctx.fillText('VODKA', 21, 44);
    },
    water_bottle(ctx) {
        bottle(ctx, 20, 8, 24, 48, '#3a8ad0', false);
        ctx.fillStyle = '#1a5a9a'; ctx.fillRect(26, 4, 12, 8);
    },
    energy_drink(ctx) {
        ctx.fillStyle = '#2a9a3a'; rr(ctx, 22, 12, 20, 42, 5); ctx.fill();
        ctx.fillStyle = '#c0c4c8'; ctx.fillRect(22, 12, 20, 5);
        ctx.fillStyle = '#ffe93a';
        ctx.beginPath(); ctx.moveTo(35, 20); ctx.lineTo(27, 36); ctx.lineTo(33, 36);
        ctx.lineTo(29, 48); ctx.lineTo(39, 32); ctx.lineTo(33, 32); ctx.closePath(); ctx.fill();
    },
    ammo_pistol(ctx) {
        bullet(ctx, 12, 14, 36, '#b08d3f', '#8a8f96');
        bullet(ctx, 27, 14, 36, '#b08d3f', '#8a8f96');
        bullet(ctx, 42, 14, 36, '#b08d3f', '#8a8f96');
    },
    ammo_rifle(ctx) {
        bullet(ctx, 12, 8, 44, '#9a7a30', '#3a7a3a');
        bullet(ctx, 27, 8, 44, '#9a7a30', '#3a7a3a');
        bullet(ctx, 42, 8, 44, '#9a7a30', '#3a7a3a');
    },
    ammo_shotgun(ctx) {
        ctx.fillStyle = '#b03030';
        rr(ctx, 14, 18, 14, 32, 3); ctx.fill();
        rr(ctx, 36, 18, 14, 32, 3); ctx.fill();
        ctx.fillStyle = '#c9a44a';
        ctx.fillRect(14, 42, 14, 8); ctx.fillRect(36, 42, 14, 8);
    },
    ammo_sniper(ctx) {
        bullet(ctx, 18, 6, 50, '#8a8f96', '#d0d4d8');
        bullet(ctx, 36, 6, 50, '#8a8f96', '#d0d4d8');
    },
    artifact_moonlight(ctx) { glowOrb(ctx, 32, 32, 20, '#eaf6ff', '#5a9ad0'); },
    artifact_soul(ctx) {
        glowOrb(ctx, 32, 32, 19, '#ffb060', '#b04010');
        ctx.fillStyle = '#ffe0a0';
        ctx.beginPath(); ctx.arc(26, 26, 5, 0, 7); ctx.fill();
    },
    artifact_battery(ctx) {
        ctx.fillStyle = '#7a9a2a'; rr(ctx, 20, 16, 24, 34, 5); ctx.fill();
        ctx.fillStyle = '#c0c4c8'; ctx.fillRect(26, 10, 12, 6);
        ctx.fillStyle = '#e8f040'; ctx.font = 'bold 16px sans-serif';
        ctx.fillText('+', 27, 36); ctx.fillText('–', 27, 48);
    },
    artifact_fireball(ctx) {
        glowOrb(ctx, 32, 34, 19, '#ffdd60', '#c03010');
        ctx.fillStyle = '#ff7030';
        ctx.beginPath(); ctx.moveTo(32, 8);
        ctx.quadraticCurveTo(44, 26, 32, 40);
        ctx.quadraticCurveTo(20, 26, 32, 8); ctx.fill();
    },
    artifact_gravi(ctx) {
        ctx.strokeStyle = '#a060e0'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.2) {
            const r = 3 + a * 2.2;
            const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r;
            a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        glowOrb(ctx, 32, 32, 6, '#e0b0ff', '#6020a0');
    },
    artifact_kolobok(ctx) {
        ctx.fillStyle = '#8a5a2a';
        ctx.beginPath(); ctx.arc(32, 34, 18, 0, 7); ctx.fill();
        ctx.fillStyle = '#a87840';
        ctx.beginPath(); ctx.arc(32, 30, 13, 0, 7); ctx.fill();
    },
    artifact_nightstar(ctx) {
        ctx.fillStyle = '#1a2a5a';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4, r = i % 2 ? 8 : 22;
            const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        glowOrb(ctx, 32, 32, 7, '#cfe4ff', '#3a6ad0');
    },
    artifact_sparkler(ctx) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6);
            ctx.lineTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22);
            ctx.stroke();
        }
        glowOrb(ctx, 32, 32, 8, '#fff', '#ffd970');
    },
    artifact_stoneblood(ctx) {
        ctx.fillStyle = '#701818';
        ctx.beginPath();
        ctx.moveTo(18, 44); ctx.lineTo(24, 22); ctx.lineTo(40, 18);
        ctx.lineTo(48, 36); ctx.lineTo(38, 48); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c03030';
        ctx.beginPath(); ctx.moveTo(24, 22); ctx.lineTo(40, 18); ctx.lineTo(34, 32); ctx.closePath(); ctx.fill();
    },
    detector_basic(ctx) {
        ctx.fillStyle = '#6a6f75'; rr(ctx, 16, 26, 32, 24, 4); ctx.fill();
        ctx.strokeStyle = '#3a3d40'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(40, 26); ctx.lineTo(48, 10); ctx.stroke();
        ctx.fillStyle = '#7ac87a'; ctx.fillRect(21, 31, 14, 8);
    },
    detector_advanced(ctx) {
        ctx.fillStyle = '#3a3f45'; rr(ctx, 14, 24, 36, 26, 4); ctx.fill();
        ctx.strokeStyle = '#22252a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(44, 24); ctx.lineTo(54, 6); ctx.stroke();
        ctx.fillStyle = '#4ae08a'; ctx.fillRect(19, 29, 18, 10);
        ctx.strokeStyle = '#8ae08a'; ctx.lineWidth = 1; rr(ctx, 14, 24, 36, 26, 4); ctx.stroke();
    },
    detector(ctx) {
        ctx.fillStyle = '#4a5a3a'; rr(ctx, 16, 26, 32, 24, 4); ctx.fill();
        ctx.strokeStyle = '#2a3522'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(40, 26); ctx.lineTo(48, 10); ctx.stroke();
        ctx.fillStyle = '#d0d47a'; ctx.fillRect(21, 31, 14, 8);
    },
    flashlight(ctx) {
        ctx.save(); ctx.translate(32, 32); ctx.rotate(-0.5);
        ctx.fillStyle = '#2a2d30'; rr(ctx, -18, -7, 26, 14, 5); ctx.fill();
        ctx.fillStyle = '#4a4e52'; rr(ctx, 6, -10, 12, 20, 4); ctx.fill();
        ctx.fillStyle = '#ffe9a0';
        ctx.beginPath(); ctx.moveTo(18, -8); ctx.lineTo(34, -14); ctx.lineTo(34, 14); ctx.lineTo(18, 8);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    },
    binoculars(ctx) {
        ctx.fillStyle = '#22252a';
        ctx.beginPath(); ctx.arc(22, 32, 12, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 32, 12, 0, 7); ctx.fill();
        ctx.fillRect(22, 26, 20, 12);
        ctx.fillStyle = '#5a7a9a';
        ctx.beginPath(); ctx.arc(22, 32, 6, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 32, 6, 0, 7); ctx.fill();
    },
    pda(ctx) {
        ctx.fillStyle = '#2a2d33'; rr(ctx, 20, 10, 24, 44, 5); ctx.fill();
        ctx.fillStyle = '#3a5a3a'; ctx.fillRect(24, 16, 16, 20);
        ctx.fillStyle = '#7ae07a'; ctx.font = '6px monospace';
        ctx.fillText('STALK', 25, 24); ctx.fillText('ER', 25, 31);
        ctx.fillStyle = '#55585e';
        for (let i = 0; i < 3; i++) ctx.fillRect(24, 40 + i * 4, 16, 2);
    },
    documents(ctx) {
        ctx.fillStyle = '#d8d4c8'; ctx.fillRect(18, 16, 28, 36);
        ctx.fillStyle = '#e8e4d8'; ctx.fillRect(22, 12, 28, 36);
        ctx.fillStyle = '#8a8578';
        for (let i = 0; i < 5; i++) ctx.fillRect(26, 20 + i * 6, 20, 2);
        ctx.fillStyle = '#a03030'; ctx.beginPath(); ctx.arc(40, 40, 6, 0, 7); ctx.fill();
    },
};

function gearIcon(ctx,id) {
    ctx.fillStyle='#69715d';ctx.strokeStyle='#252d27';ctx.lineWidth=2;
    if(id.startsWith('helmet')){ctx.beginPath();ctx.arc(32,32,19,Math.PI,Math.PI*2);ctx.lineTo(53,36);ctx.lineTo(12,36);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#252d27';ctx.fillRect(13,34,39,4);}
    else if(id.startsWith('armor')){rr(ctx,14,15,36,38,5);ctx.fill();ctx.fillStyle='#3c4436';ctx.fillRect(17,8,7,14);ctx.fillRect(40,8,7,14);ctx.fillRect(18,36,11,12);ctx.fillRect(35,36,11,12);ctx.strokeRect(18,22,28,9);}
    else if(id.startsWith('backpack')){rr(ctx,17,9,30,45,9);ctx.fill();ctx.fillStyle='#414b39';rr(ctx,21,31,22,17,4);ctx.fill();ctx.strokeRect(20,14,24,12);}
    else{ctx.fillStyle='#59605d';const pistol=id==='pm_pistol';rr(ctx,pistol?17:6,24,pistol?32:49,8,2);ctx.fill();ctx.fillStyle='#6b4d32';ctx.fillRect(pistol?36:42,30,7,pistol?16:10);ctx.fillRect(8,30,pistol?0:12,5);ctx.fillStyle='#343c37';ctx.fillRect(pistol?33:29,31,6,12);ctx.fillRect(pistol?18:6,23,pistol?8:42,2);}
}

function fallbackIcon(ctx, id) {
    ctx.fillStyle = '#5a5f66'; rr(ctx, 14, 14, 36, 36, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(id.charAt(0).toUpperCase(), 32, 42);
    ctx.textAlign = 'left';
}

export const ItemIcons = {
    get(iconId) {
        if (cache.has(iconId)) return cache.get(iconId);
        const [c, ctx] = makeCanvas();
        try {
            (painters[iconId] || (ctx => /^(helmet|armor|backpack)/.test(iconId)||['pm_pistol','ak74','shotgun_toz','svd_sniper'].includes(iconId)?gearIcon(ctx,iconId):fallbackIcon(ctx, iconId)))(ctx);
        } catch (e) {
            fallbackIcon(ctx, iconId);
        }
        const url = c.toDataURL();
        cache.set(iconId, url);
        return url;
    },
    /** Pre-render all icons (call at boot to avoid first-open hitch). */
    preload() {
        for (const id of Object.keys(painters)) this.get(id);
    },
    count() { return Object.keys(painters).length; },
};
