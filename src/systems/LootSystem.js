import { AdditionalWeapons } from '../data/NewWeapons.js';
import * as THREE from 'three';

import { globalEventBus, GameEvents } from '../core/EventBus.js';

import { getItem } from '../data/items.js';

import { getProceduralSet, makeCrossDecal } from '../world/ProceduralTextures.js';

import { compactStaticGroup } from '../world/CompactStaticGroup.js';

import { seatOnGround } from '../world/GroundPlacement.js';



/**

 * LootSystem - believable containers scattered through the world.

 *

 * Replaces the old "glowing floating cubes" pickups with containers that

 * make sense where they are:

 *   - supply_crate  : military green crate at building doorways / industrial

 *   - med_crate      : white crate with red cross, near buildings

 *   - stash         : hidden backpack near anomaly fields (risk/reward)

 *   - corpse_bandit : dead bandit - what they were carrying

 *   - corpse_mutant : dead mutant - occasionally an artifact

 *   - trash         : low-value scraps in rubble

 *

 * Enemy deaths become searchable corpses via the 'loot:corpse' event.

 */



export const CONTAINER_DEFS = {

    supply_crate:  { label: 'Supply Crate',  prompt: 'Search supply crate' },

    med_crate:     { label: 'Medical Crate', prompt: 'Search medical crate' },

    stash:         { label: 'Hidden Stash',  prompt: 'Search stash' },

    corpse_bandit: { label: 'Dead Bandit',   prompt: 'Search body' },

    corpse_mutant: { label: 'Dead Mutant',   prompt: 'Search mutant' },

    trash:         { label: 'Trash Pile',    prompt: 'Search trash' },

};



const LOOT_TABLES = {

    supply_crate: [

        { item: 'ammo_rifle', chance: 0.70, amount: [10, 30] },

        { item: 'ammo_pistol', chance: 0.50, amount: [8, 24] },

        { item: 'medkit_small', chance: 0.40, amount: [1, 1] },

        { item: 'bandage', chance: 0.50, amount: [1, 3] },

        { item: 'canned_food', chance: 0.50, amount: [1, 2] },

        { item: 'energy_drink', chance: 0.30, amount: [1, 2] },

    ],

    med_crate: [

        { item: 'medkit_small', chance: 0.60, amount: [1, 2] },

        { item: 'bandage', chance: 0.70, amount: [2, 4] },

        { item: 'antirad', chance: 0.50, amount: [1, 2] },

        { item: 'medkit_large', chance: 0.20, amount: [1, 1] },

        { item: 'antirad_strong', chance: 0.15, amount: [1, 1] },

    ],

    stash: [

        { item: 'ammo_rifle', chance: 0.60, amount: [20, 40] },

        { item: 'antirad_strong', chance: 0.40, amount: [1, 2] },

        { item: 'documents', chance: 0.30, amount: [1, 1] },

        { item: 'artifact_moonlight', chance: 0.18, amount: [1, 1] },

        { item: 'artifact_soul', chance: 0.18, amount: [1, 1] },

        { item: 'artifact_battery', chance: 0.18, amount: [1, 1] },

        { item: 'medkit_large', chance: 0.30, amount: [1, 1] },

    ],

    corpse_bandit: [

        { item: 'ammo_pistol', chance: 0.40, amount: [4, 12] },

        { item: 'ammo_rifle', chance: 0.20, amount: [5, 15] },

        { item: 'bread', chance: 0.35, amount: [1, 2] },

        { item: 'vodka', chance: 0.25, amount: [1, 1] },

        { item: 'bandage', chance: 0.30, amount: [1, 2] },

        { item: 'medkit_small', chance: 0.12, amount: [1, 1] },

    ],

    corpse_mutant: [

        { item: 'artifact_battery', chance: 0.15, amount: [1, 1] },

        { item: 'artifact_moonlight', chance: 0.08, amount: [1, 1] },

        { item: 'bandage', chance: 0.15, amount: [1, 2] },

    ],

    trash: [

        { item: 'bread', chance: 0.15, amount: [1, 1] },

        { item: 'canned_food', chance: 0.10, amount: [1, 1] },

        { item: 'bandage', chance: 0.10, amount: [1, 1] },

        { item: 'water_bottle', chance: 0.12, amount: [1, 1] },

    ],

};



let containerCounter = 0;



export class LootSystem {

    constructor(game) {

        this.game = game;

        this.containers = new Map();



        // Enemy deaths arrive here -> become searchable corpses

        globalEventBus.on('loot:corpse', (data) => {

            this.spawnCorpse(data.position, data.kind, data.lootTable);

        });

    }



    /* ------------------------------------------------------------------ */

    /* Level population                                                    */

    /* ------------------------------------------------------------------ */



    populateLevel(levelData) {

        this.clear();

        const wm = this.game.worldManager;

        if (!wm) return;



        const spots = wm.buildingSpots || [];

        // Crates at buildings: supply/med crates near doorways, trash in rubble

        for (const s of spots) {

            const r = Math.random();

            if (s.enterable) {

                if (r < 0.7) {
                    const medical = s.shopType === 2;
                    const foodShop = [0,4,5].includes(s.shopType);
                    const items = foodShop ? [{id:'canned_food',count:1+Math.floor(Math.random()*2)},{id:'water_bottle',count:1}]
                        : medical ? [{id:'bandage',count:2},{id:'medkit_small',count:1}] : this.rollLoot('supply_crate');
                    const c = this.spawnContainer(medical ? 'med_crate' : 'supply_crate', s.lootSupport.x, s.lootSupport.z, {supportY:s.lootSupport.y,items});
                    c.label = medical ? 'Pharmacy supplies' : foodShop ? 'Food pantry' : 'Service supplies';
                    c.mesh.traverse(o=>{if(o.userData.isInteractive)o.userData.promptText=`Search ${c.label.toLowerCase()}`;});
                }

                continue;

            }

            if (s.enterable) {
                if (r < 0.7) {
                    const medical = s.shopType === 2;
                    const foodShop = [0,4,5].includes(s.shopType);
                    const items = foodShop ? [{id:'canned_food',count:1+Math.floor(Math.random()*2)},{id:'water_bottle',count:1}]
                        : medical ? [{id:'bandage',count:2},{id:'medkit_small',count:1}] : this.rollLoot('supply_crate');
                    const c = this.spawnContainer(medical ? 'med_crate' : 'supply_crate', s.lootSupport.x, s.lootSupport.z, {supportY:s.lootSupport.y,items});
                    c.label = medical ? 'Pharmacy supplies' : foodShop ? 'Food pantry' : 'Service supplies';
                    c.mesh.traverse(o=>{if(o.userData.isInteractive)o.userData.promptText=`Search ${c.label.toLowerCase()}`;});
                }
                continue;
            }
            if (r < 0.30) this.placeAtBuilding(s, 'supply_crate');

            else if (r < 0.45) this.placeAtBuilding(s, 'med_crate');

            if (Math.random() < 0.12) this.placeAtBuilding(s, 'trash');

        }



        // Corpses scattered in the streets (dead stalkers who didn't make it)

        const bounds = wm.levelBounds;

        const corpseCount = Math.max(3, Math.floor(spots.length * 0.025));

        for (let i = 0; i < corpseCount; i++) {

            const p = this._randomGroundPoint(bounds, spots);

            if (p) {

                const kind = Math.random() < 0.75 ? 'corpse_bandit' : 'corpse_mutant';

                this.spawnContainer(kind, p.x, p.z);

            }

        }



        // Stashes hidden near anomaly fields - risk/reward, like the Zone

        // (level configs use field.center = [x, y, z]; accept {x,z} too)

        for (const field of (levelData.anomalyFields || [])) {

            const fx = field.x ?? field.center?.[0] ?? 0;

            const fz = field.z ?? field.center?.[2] ?? 0;

            const count = Math.random() < 0.6 ? 1 : 2;

            for (let i = 0; i < count; i++) {

                const angle = Math.random() * Math.PI * 2;

                const dist = 4 + Math.random() * 7;

                const x = fx + Math.cos(angle) * dist;

                const z = fz + Math.sin(angle) * dist;

                if (this._insideBounds(x, z, bounds)) {

                    this.spawnContainer('stash', x, z);

                }

            }

        }

    }



    placeAtBuilding(spot, type) {

        // Put the container just outside a random face (doorway-ish)

        const side = Math.floor(Math.random() * 4);

        const out = 1.5 + Math.random() * 0.8;

        let x = spot.x, z = spot.z;

        if (side === 0) z -= spot.depth / 2 + out;

        else if (side === 1) z += spot.depth / 2 + out;

        else if (side === 2) x -= spot.width / 2 + out;

        else x += spot.width / 2 + out;

        this.spawnContainer(type, x, z);

    }



    _randomGroundPoint(bounds, spots) {

        if (!bounds) return null;

        for (let tries = 0; tries < 20; tries++) {

            const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);

            const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);

            // Keep out of building footprints

            let inside = false;

            for (const s of spots) {

                if (Math.abs(x - s.x) < s.width / 2 + 1 && Math.abs(z - s.z) < s.depth / 2 + 1) {

                    inside = true; break;

                }

            }

            if (!inside) return { x, z };

        }

        return null;

    }



    _insideBounds(x, z, bounds) {

        return bounds && x > bounds.min.x && x < bounds.max.x && z > bounds.min.z && z < bounds.max.z;

    }



    /* ------------------------------------------------------------------ */

    /* Containers                                                          */

    /* ------------------------------------------------------------------ */



    rollLoot(type) {

        const items = [];

        for (const entry of (LOOT_TABLES[type] || [])) {

            if (Math.random() < entry.chance) {

                const [a, b] = entry.amount;

                const count = a + Math.floor(Math.random() * (b - a + 1));

                if (getItem(entry.item)) items.push({ id: entry.item, count });

            }

        }

        if(['supply_crate','stash','corpse_bandit'].includes(type)&&Math.random()<.28){const ids=Object.keys(AdditionalWeapons);items.push({id:'weapon_'+ids[Math.floor(Math.random()*ids.length)],count:1});}
        if(['supply_crate','stash','corpse_bandit'].includes(type)&&Math.random()<.18)items.push({id:'frag_grenade',count:1});
        return items;

    }



    spawnContainer(type, x, z, opts = {}) {

        const wm = this.game.worldManager;

        const def = CONTAINER_DEFS[type] || CONTAINER_DEFS.trash;

        const y = wm.getTerrainHeight(x, z);



        const mesh = compactStaticGroup(ContainerMeshes.build(type));

        mesh.position.set(x, y, z);

        mesh.rotation.y = Math.random() * Math.PI * 2;

        seatOnGround(mesh,(px,pz)=>opts.supportY ?? wm.getTerrainHeight(px,pz));



        const id = `container_${++containerCounter}`;

        const container = {

            id, type, mesh,

            label: def.label,

            items: opts.items || this.rollLoot(type),

            searched: false,

        };

        mesh.userData.interactable = {

            id,

            type: 'loot_container',

            onInteract: () => this.openContainer(id),

        };

        mesh.userData.isInteractive = true;

        mesh.userData.promptText = def.prompt;

        // Propagate to child meshes: raycasts hit children, not the group

        mesh.traverse(o => {

            if (o === mesh) return;

            o.userData.isInteractive = true;

            o.userData.interactable = mesh.userData.interactable;

            o.userData.promptText = def.prompt;

        });



        this.containers.set(id, container);

        wm.scene.add(mesh);



        // Stashes appear on the compass once the player gets close

        if (type === 'stash') {

            this.game.compassSystem?.addMarker(id, {

                x, z, icon: '✦', label: 'Hidden Stash',

                color: '#9adcff', revealDist: 30,

            });

        }

        return container;

    }



    spawnCorpse(position, kind = 'human', lootTable = null) {

        const wm = this.game.worldManager;

        if (!wm || !position) return;

        const type = kind === 'mutant' ? 'corpse_mutant' : 'corpse_bandit';

        const items = [];

        if (lootTable) {

            for (const entry of lootTable) {

                if (Math.random() < entry.chance) {

                    const [a, b] = entry.amount;

                    const count = a + Math.floor(Math.random() * (b - a + 1));

                    if (getItem(entry.item)) items.push({ id: entry.item, count });

                }

            }

        }

        const c = this.spawnContainer(type, position.x, position.z, { items });

        // Corpses from real kills use the rolled enemy loot if the table was empty

        if (c.items.length === 0 && !lootTable) c.items = this.rollLoot(type);

        return c;

    }



    openContainer(id) {

        const c = this.containers.get(id);

        if (!c) return;

        if (c.items.length === 0 && c.searched) {

            globalEventBus.emit(GameEvents.NOTIFICATION, { message: 'Nothing left to take', type: 'info' });

            return;

        }

        c.searched = true;

        this._updatePrompt(c);

        this.game.uiManager?.showLootContainer(c);

    }



    takeItem(containerId, index) {

        const c = this.containers.get(containerId);

        if (!c || !c.items[index]) return false;

        const entry = c.items[index];

        const added = this.game.inventorySystem.addItem(entry.id, entry.count);

        if (added) {
            if(entry.weaponState){const slot=this.game.inventorySystem.slots.find(s=>s?.id===entry.id&&!s.weaponState);if(slot)slot.weaponState=structuredClone(entry.weaponState);}
            c.items.splice(index, 1);

            globalEventBus.emit(GameEvents.NOTIFICATION, { message: `Taken: ${getItem(entry.id)?.name || entry.id} ×${entry.count}`, type: 'success' });

            this._refreshContainer(c);

            return true;

        }

        globalEventBus.emit(GameEvents.NOTIFICATION, {

            message: 'Too heavy / inventory full', type: 'warning'

        });

        return false;

    }



    takeAll(containerId) {

        const c = this.containers.get(containerId);

        if (!c) return;

        // Take what fits, leave the rest (no item loss on overweight)

        for (let i = c.items.length - 1; i >= 0; i--) {

            const entry = c.items[i];

            if (this.game.inventorySystem.addItem(entry.id, entry.count)) {
                if(entry.weaponState){const slot=this.game.inventorySystem.slots.find(s=>s?.id===entry.id&&!s.weaponState);if(slot)slot.weaponState=structuredClone(entry.weaponState);}
                c.items.splice(i, 1);

            }

        }

        if (c.items.length) globalEventBus.emit(GameEvents.NOTIFICATION, { message: 'Pack full — remaining items stay here', type: 'warning' });

        else globalEventBus.emit(GameEvents.NOTIFICATION, { message: 'All supplies collected', type: 'success' });

        this._refreshContainer(c);

    }



    _updatePrompt(c) {

        const prompt = c.items.length ? (CONTAINER_DEFS[c.type]?.prompt || 'Search container') : `${c.label} (empty)`;

        c.mesh.traverse(o => { if (o.userData.isInteractive) o.userData.promptText = prompt; });

    }



    _refreshContainer(c) {

        this._updatePrompt(c);

        if (c.items.length === 0) {

            c.mesh.userData.promptText = `${c.label} (empty)`;

            c.mesh.traverse(o => {

                if (!o.isMesh) return;

                for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {

                    if (mat.emissive) mat.emissiveIntensity = 0;

                }

            });

            this.game.uiManager?.closeLootContainer?.();

        } else {

            this.game.uiManager?.showLootContainer(c);

        }

    }



    update(_deltaTime) {

        // Reserved for idle animation (dust motes, marker pulse)

    }



    serialize(){return [...this.containers.values()].map(c=>({type:c.type,position:c.mesh.position.toArray(),rotation:c.mesh.rotation.y,label:c.label,items:structuredClone(c.items),searched:c.searched}));}
    restore(data){if(!Array.isArray(data))return;this.clear();for(const c of data){const created=this.spawnContainer(c.type,c.position[0],c.position[2],{items:structuredClone(c.items),supportY:c.position[1]});created.mesh.position.fromArray(c.position);created.mesh.rotation.y=c.rotation;created.label=c.label;created.searched=c.searched;this._updatePrompt(created);}}

    clear() {

        const wm = this.game?.worldManager;

        for (const c of this.containers.values()) {

            if (wm?.scene) wm.scene.remove(c.mesh);

            if (c.type === 'stash') this.game?.compassSystem?.removeMarker(c.id);

            c.mesh.traverse(o => {

                if (!o.isMesh) return;

                o.geometry.dispose();

                for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) mat.dispose();

            });

        }

        this.containers.clear();

    }

}



/* ---------------------------------------------------------------------- */

/* Container meshes - procedural, believable, no floating glow cubes      */

/* ---------------------------------------------------------------------- */



class ContainerMeshes {

    static build(type) {

        switch (type) {

            case 'supply_crate': return this.supplyCrate();

            case 'med_crate': return this.medCrate();

            case 'stash': return this.stash();

            case 'corpse_bandit': return this.corpse(false);

            case 'corpse_mutant': return this.corpse(true);

            case 'trash': return this.trash();

            default: return this.supplyCrate();

        }

    }



    static supplyCrate() {

        const g = new THREE.Group();

        const tex = getProceduralSet('metal');

        const mat = new THREE.MeshStandardMaterial({

            color: 0x4a5240, roughness: 0.7, metalness: 0.35,

            map: tex.map, bumpMap: tex.bumpMap, bumpScale: 0.4,

        });

        const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.6), mat);

        box.position.y = 0.28;

        g.add(box);

        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.1, 0.64),

            new THREE.MeshStandardMaterial({ color: 0x3a4234, roughness: 0.7, metalness: 0.35 }));

        lid.position.y = 0.58;

        g.add(lid);

        // straps

        const strapMat = new THREE.MeshStandardMaterial({ color: 0x2a2d26, roughness: 0.8 });

        for (const sx of [-0.25, 0.25]) {

            const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.64), strapMat);

            strap.position.set(sx, 0.32, 0);

            g.add(strap);

        }

        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

        return g;

    }



    static medCrate() {

        const g = new THREE.Group();

        const mat = new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.6 });

        const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), mat);

        box.position.y = 0.23;

        g.add(box);

        const cross = makeCrossDecal(0.22);

        cross.position.set(0, 0.46, 0);

        cross.rotation.x = -Math.PI / 2;

        g.add(cross);

        const crossF = makeCrossDecal(0.18);

        crossF.position.set(0, 0.23, -0.256);

        crossF.rotation.y = Math.PI;

        g.add(crossF);

        g.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry') { o.castShadow = true; o.receiveShadow = true; } });

        return g;

    }



    static stash() {

        // Hidden backpack, half-buried look

        const g = new THREE.Group();

        const mat = new THREE.MeshStandardMaterial({ color: 0x5a5a40, roughness: 0.95 });

        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.3), mat);

        pack.position.y = 0.28;

        pack.rotation.z = 0.12;

        g.add(pack);

        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.18, 0.32),

            new THREE.MeshStandardMaterial({ color: 0x4a4a34, roughness: 0.95 }));

        flap.position.y = 0.5;

        flap.rotation.z = 0.12;

        g.add(flap);

        const strapMat = new THREE.MeshStandardMaterial({ color: 0x2e2e22, roughness: 1 });

        for (const sx of [-0.12, 0.12]) {

            const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), strapMat);

            strap.position.set(sx, 0.3, -0.16);

            g.add(strap);

        }

        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

        return g;

    }



    static corpse(isMutant) {

        const g = new THREE.Group();

        const jacket = isMutant ? 0x3a4038 : 0x4a3a30;

        const skin = isMutant ? 0x5a6a55 : 0x8a7a6a;

        const jacketMat = new THREE.MeshStandardMaterial({ color: jacket, roughness: 0.95 });

        const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.85 });

        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.95 });



        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.6), jacketMat);

        torso.position.y = 0.11;

        g.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skinMat);

        head.position.set(0.05, 0.1, -0.42);

        g.add(head);

        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.7), pantsMat);

        legs.position.set(-0.02, 0.09, 0.62);

        legs.rotation.y = isMutant ? 0.35 : 0.1;

        g.add(legs);

        // arms - mutants sprawl

        for (const s of [-1, 1]) {

            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.55), jacketMat);

            arm.position.set(s * (isMutant ? 0.38 : 0.28), 0.08, 0.05);

            arm.rotation.y = s * (isMutant ? 0.9 : 0.25);

            g.add(arm);

        }

        if (!isMutant) {

            // bandit keeps his boots on

            for (const s of [-1, 1]) {

                const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28),

                    new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 1 }));

                boot.position.set(s * 0.1 - 0.02, 0.06, 1.0);

                g.add(boot);

            }

        } else {

            // mutant spikes hint

            const spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a2d24, roughness: 1 });

            for (let i = 0; i < 3; i++) {

                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 5), spikeMat);

                spike.position.set((i - 1) * 0.12, 0.26, 0.1);

                g.add(spike);

            }

        }

        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

        return g;

    }



    static trash() {

        const g = new THREE.Group();

        const tex = getProceduralSet('rubble');

        const mat = new THREE.MeshStandardMaterial({

            color: 0x5a544a, roughness: 1, map: tex.map, bumpMap: tex.bumpMap, bumpScale: 0.6,

        });

        for (let i = 0; i < 5; i++) {

            const rock = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12 + Math.random() * 0.15), mat);

            rock.position.set((Math.random() - 0.5) * 0.8, 0.08, (Math.random() - 0.5) * 0.8);

            rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);

            g.add(rock);

        }

        // a tin can or two

        const canMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.5, metalness: 0.7 });

        for (let i = 0; i < 2; i++) {

            const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), canMat);

            can.position.set((Math.random() - 0.5) * 0.7, 0.06, (Math.random() - 0.5) * 0.7);

            can.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.4;

            g.add(can);

        }

        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

        return g;

    }

}



/* ---------------------------------------------------------------------- */

/* Item meshes - pickups that look like what they are                     */

/* ---------------------------------------------------------------------- */



export class ItemMeshFactory {

    static build(itemId) {

        const b = ItemMeshFactory;

        switch (itemId) {

            case 'medkit_small': case 'medkit_large':

                return b.medkit(itemId === 'medkit_large' ? 1.25 : 1);

            case 'bandage': return b.box(0.16, 0.05, 0.12, 0xe8e4da);

            case 'antirad': case 'antirad_strong':

                return b.bottle(itemId === 'antirad_strong' ? 0xff5533 : 0xff8833);

            case 'ammo_pistol': case 'ammo_rifle': case 'ammo_shotgun': case 'ammo_sniper':

                return b.ammoBox();

            case 'bread': return b.box(0.22, 0.1, 0.12, 0x9a6a3a);

            case 'sausage': return b.box(0.24, 0.07, 0.07, 0x6a3a28);

            case 'canned_food': return b.can(0xb8b4a8);

            case 'energy_drink': return b.can(0xcc2222);

            case 'water_bottle': return b.bottle(0x4488cc);

            case 'vodka': return b.bottle(0x2a7a3a);

            case 'artifact_moonlight': return b.artifact(0x88ccff);

            case 'artifact_soul': return b.artifact(0xff6644);

            case 'artifact_battery': return b.artifact(0xffe066);

            case 'detector': return b.detector();

            case 'flashlight': return b.flashlight();

            case 'documents': return b.box(0.25, 0.03, 0.18, 0xd8d0b8);

            case 'binoculars': return b.binoculars();

            case 'pda': return b.box(0.16, 0.03, 0.1, 0x2a2d33);

            default: return b.box(0.18, 0.12, 0.12, 0x8a8578);

        }

    }



    static box(w, h, d, color) {

        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),

            new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));

        m.castShadow = true;

        return m;

    }



    static medkit(scale = 1) {

        const g = new THREE.Group();

        const box = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, 0.12 * scale, 0.2 * scale),

            new THREE.MeshStandardMaterial({ color: 0xdcd8cc, roughness: 0.6 }));

        g.add(box);

        const cross = makeCrossDecal(0.12 * scale);

        cross.rotation.x = -Math.PI / 2;

        cross.position.y = 0.061 * scale;

        g.add(cross);

        g.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry') o.castShadow = true; });

        return g;

    }



    static bottle(color) {

        const g = new THREE.Group();

        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, transparent: true, opacity: 0.85 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 12), mat);

        body.position.y = 0.1;

        g.add(body);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.06, 10), mat);

        neck.position.y = 0.23;

        g.add(neck);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10),

            new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }));

        cap.position.y = 0.27;

        g.add(cap);

        g.traverse(o => { if (o.isMesh) o.castShadow = true; });

        return g;

    }



    static can(color) {

        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 12),

            new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 }));

        m.castShadow = true;

        return m;

    }



    static ammoBox() {

        const g = new THREE.Group();

        const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.16),

            new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.7, metalness: 0.3 }));

        g.add(box);

        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, 0.17),

            new THREE.MeshStandardMaterial({ color: 0x3a422c, roughness: 0.7, metalness: 0.3 }));

        lid.position.y = 0.07;

        g.add(lid);

        g.traverse(o => { if (o.isMesh) o.castShadow = true; });

        return g;

    }



    static artifact(color) {

        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0),

            new THREE.MeshStandardMaterial({

                color, emissive: color, emissiveIntensity: 0.8,

                roughness: 0.2, transparent: true, opacity: 0.9,

            }));

        m.castShadow = true;

        return m;

    }



    static detector() {

        const g = new THREE.Group();

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.16),

            new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.6 }));

        g.add(body);

        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6),

            new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.4 }));

        ant.position.set(0.04, 0.1, 0);

        g.add(ant);

        g.traverse(o => { if (o.isMesh) o.castShadow = true; });

        return g;

    }



    static flashlight() {

        const g = new THREE.Group();

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.14, 10),

            new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.5, metalness: 0.5 }));

        body.rotation.z = Math.PI / 2;

        g.add(body);

        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.06, 10),

            new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.5, metalness: 0.5 }));

        head.rotation.z = Math.PI / 2;

        head.position.x = 0.1;

        g.add(head);

        g.traverse(o => { if (o.isMesh) o.castShadow = true; });

        return g;

    }



    static binoculars() {

        const g = new THREE.Group();

        const mat = new THREE.MeshStandardMaterial({ color: 0x2a2d24, roughness: 0.7 });

        for (const s of [-1, 1]) {

            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.14, 10), mat);

            tube.rotation.x = Math.PI / 2;

            tube.position.set(s * 0.045, 0, 0);

            g.add(tube);

        }

        g.traverse(o => { if (o.isMesh) o.castShadow = true; });

        return g;

    }

}

