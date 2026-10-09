import {motionScale} from '../core/settings/Accessibility.js';
import { AdditionalWeapons } from '../data/NewWeapons.js';
import { FirstPersonHands,HANDLING_PROFILES } from './FirstPersonHands.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { globalEventBus, GameEvents } from '../core/EventBus.js';

// Scratch vector for the ADS pose math in Weapon.updateVisuals
// (avoids per-frame allocation).
const _aimPos = new THREE.Vector3();

/**
 * Weapon definitions
 */
export const WeaponData = {
    ...AdditionalWeapons,
    pm_pistol: {
        id: 'pm_pistol',
        name: 'PM Pistol',
        type: 'pistol',
        damage: 34,
        fireRate: 3,
        accuracy: 0.85,
        recoil: 0.08,
        range: 50,
        magazineSize: 8,
        reloadTime: 2.0,
        ammoType: 'pistol',
        automatic: false,
        weight: 0.73
    },
    
    ak74: {
        id: 'ak74',
        name: 'AK-74',
        type: 'rifle',
        damage: 56,
        fireRate: 10,
        accuracy: 0.75,
        recoil: 0.15,
        range: 200,
        magazineSize: 30,
        reloadTime: 2.5,
        ammoType: 'rifle',
        automatic: true,
        weight: 3.3
    },
    
    shotgun_toz: {
        id: 'shotgun_toz',
        name: 'TOZ-34',
        type: 'shotgun',
        damage: 100,
        fireRate: 1,
        accuracy: 0.6,
        recoil: 0.3,
        range: 30,
        magazineSize: 2,
        reloadTime: 3.0,
        ammoType: 'shotgun',
        automatic: false,
        pellets: 8,
        spread: 0.1,
        weight: 3.3
    },
    
    svd_sniper: {
        id: 'svd_sniper',
        name: 'SVD Dragunov',
        type: 'sniper',
        damage: 120,
        fireRate: 1,
        accuracy: 0.95,
        recoil: 0.25,
        range: 500,
        magazineSize: 10,
        reloadTime: 3.5,
        ammoType: 'sniper',
        automatic: false,
        scopeZoom: 4,
        weight: 4.3
    },
    
    knife: {
        id: 'knife',
        name: 'Combat Knife',
        type: 'melee',
        damage: 38,
        structureDamage: 4,
        fireRate: 2,
        accuracy: 1.0,
        recoil: 0,
        range: 2,
        magazineSize: Infinity,
        reloadTime: 0,
        ammoType: null,
        automatic: false,
        weight: 0.3
    }
};

/**
 * Weapon class - Individual weapon instance
 */
export class Weapon {
    constructor(weaponId, game) {
        const data = WeaponData[weaponId];
        if (!data) {
            throw new Error(`Unknown weapon: ${weaponId}`);
        }
        
        this.game = game;
        this.id = weaponId;
        this.data = data;
        
        // State
        this.currentAmmo = data.magazineSize;
        this.reserveAmmo = data.magazineSize * 3;
        this.isReloading = false;
        this.reloadProgress = 0;
        this.canFire = true;
        this.fireTimer = 0;
        this.isAiming = false;
        
        // Visual
        this.mesh = null;
        this.muzzleFlash = null;
        this.muzzlePosition = new THREE.Vector3(0, -0.15, -0.5);
        
        // Animation state
        this.swayOffset = new THREE.Vector3();
        this.recoilOffset = new THREE.Vector3();
        this.aimProgress = 0;
        
        // Audio
        const soundId=this.data.type==='pistol'?'pm_pistol':this.data.type==='shotgun'?'shotgun_toz':this.data.type==='sniper'?'svd_sniper':this.data.type==='melee'?'knife':'ak74';
        this.sounds = {
            fire: `weapon_${soundId}_fire`,
            reload: `weapon_${soundId}_reload`,
            empty: 'weapon_empty',
            equip: 'weapon_equip'
        };
        
        this.createMesh();
    }

    createMesh() {
        // First-person viewmodel, built per weapon type. -Z is forward.
        // The group is parented to the ViewmodelSystem overlay rig (its own
        // scene rendered after the main pass), so it can never clip walls.
        const group = new THREE.Group();
        this.magazineParts=[];
        // Note: no environment map in the overlay scene, so keep metalness low -
        // high metalness renders near-black without env reflections.
        const metal = new THREE.MeshStandardMaterial({ color: 0x3d3d44, metalness: 0.3, roughness: 0.5 });
        const darkMetal = new THREE.MeshStandardMaterial({ color: 0x26262b, metalness: 0.25, roughness: 0.6 });
        const gunmetal = new THREE.MeshStandardMaterial({ color: 0x33333a, metalness: 0.35, roughness: 0.45 });
        const wood = new THREE.MeshStandardMaterial({ color: 0x6e4a2c, metalness: 0.05, roughness: 0.8 });
        const woodDark = new THREE.MeshStandardMaterial({ color: 0x54371f, metalness: 0.05, roughness: 0.85 });
        const polymer = new THREE.MeshStandardMaterial({ color: 0x303036, metalness: 0.1, roughness: 0.85 });
        const rubber = new THREE.MeshStandardMaterial({ color: 0x1e1e22, metalness: 0.0, roughness: 0.95 });
        const bladeSteel = new THREE.MeshStandardMaterial({ color: 0x8f979e, metalness: 0.55, roughness: 0.35 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2f3a, metalness: 0.8, roughness: 0.15, emissive: 0x0a1a24, emissiveIntensity: 0.6 });

        const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
            const m = new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(w,h,d)*0.14), mat);
            m.position.set(x, y, z);
            m.rotation.set(rx, ry, rz);
            group.add(m);
            return m;
        };
        const tube = (r1, r2, len, mat, x, y, z, seg = 12) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat);
            m.rotation.x = Math.PI / 2;
            m.position.set(x, y, z);
            group.add(m);
            return m;
        };
        const pin = (r, len, mat, x, y, z, axis = 'x') => {
            // Small cylinder along an arbitrary axis: rivets, pins, turrets.
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
            if (axis === 'x') m.rotation.z = Math.PI / 2;
            else if (axis === 'z') m.rotation.x = Math.PI / 2;
            m.position.set(x, y, z);
            group.add(m);
            return m;
        };

        // Per-weapon aim data: sightLineY is the local-space height of the
        // aligned front/rear sight tops; aimDepth is the camera-space Z of
        // the group origin while aiming. The ADS pose puts the sight line
        // exactly on the camera forward axis (the crosshair).
        let sightLineY = 0.06;
        let aimDepth = -0.32;
        let tipZ = -0.32;
        let flashY = 0.02;

        const type = this.data.type;
        if(this.data.shape==='revolver') {
            box(.045,.065,.17,metal,0,0,-.01);
            const cylinder=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.062,24),gunmetal);cylinder.rotation.z=Math.PI/2;cylinder.position.set(0,.017,-.035);group.add(cylinder);this.actionPart=cylinder;
            tube(.013,.013,.23,metal,0,.031,-.19);box(.047,.12,.064,wood,0,-.075,.07,-.25);
            box(.045,.015,.09,darkMetal,0,-.03,.005);box(.008,.018,.015,darkMetal,0,.052,-.3);
            tipZ=-.31;flashY=.031;sightLineY=.06;
        } else if(this.data.shape==='pump') {
            box(.056,.065,.20,metal,0,0,.015);tube(.017,.017,.55,metal,0,.023,-.34);tube(.018,.018,.46,darkMetal,0,-.018,-.30);
            this.actionPart=box(.065,.06,.16,wood,0,-.015,-.26);box(.057,.10,.3,wood,0,-.055,.23,-.1);
            box(.042,.017,.08,darkMetal,0,-.045,.055);box(.008,.014,.01,metal,0,.05,-.60);
            tipZ=-.615;flashY=.023;sightLineY=.055;
        } else if (type === 'pistol') {
            // PM-style pistol: frame, slide with rear serrations, notched
            // rear sight, front post, hammer, trigger group, grip with
            // panels and magazine baseplate.
            box(0.046, 0.05, 0.22, darkMetal, 0, -0.008, -0.02);      // frame
            box(0.05, 0.056, 0.24, metal, 0, 0.028, -0.03);           // slide
            for (let i = 0; i < 5; i++)                               // slide serrations
                box(0.054, 0.028, 0.007, darkMetal, 0, 0.028, 0.045 + i * 0.013);
            tube(0.011, 0.011, 0.025, darkMetal, 0, 0.028, -0.158);   // muzzle
            box(0.013, 0.02, 0.022, darkMetal, -0.013, 0.066, 0.078); // rear sight L
            box(0.013, 0.02, 0.022, darkMetal, 0.013, 0.066, 0.078);  // rear sight R (notch between)
            box(0.01, 0.022, 0.012, darkMetal, 0, 0.066, -0.14);      // front sight post
            box(0.012, 0.032, 0.018, darkMetal, 0, 0.018, 0.098, -0.45); // hammer
            box(0.042, 0.016, 0.095, darkMetal, 0, -0.042, -0.035);   // trigger guard
            box(0.01, 0.032, 0.014, darkMetal, 0, -0.038, -0.04, 0.35); // trigger
            box(0.047, 0.125, 0.056, polymer, 0, -0.098, 0.052, -0.22); // grip
            box(0.051, 0.09, 0.045, woodDark, 0, -0.095, 0.05, -0.22); // grip panels
            pin(0.004, 0.056, metal, 0, -0.075, 0.045, 'x');          // grip screw
            this.magazineParts.push(box(0.05, 0.016, 0.06, darkMetal, 0, -0.163, 0.066, -0.22)); // mag baseplate
            sightLineY = 0.076; aimDepth = -0.32; tipZ = -0.17; flashY = 0.028;
        } else if (type === 'rifle') {
            // AK-74: receiver with top cover, tangent rear sight, protected
            // front post, gas system, muzzle brake, wooden furniture, curved
            // ribbed magazine, selector and charging handle.
            box(0.06, 0.075, 0.46, metal, 0, 0.005, -0.06);           // receiver
            box(0.058, 0.014, 0.30, darkMetal, 0, 0.048, -0.12);      // top cover
            box(0.032, 0.028, 0.05, darkMetal, 0, 0.058, -0.255);     // rear sight base
            box(0.026, 0.014, 0.075, darkMetal, 0, 0.085, -0.235, 0.12); // rear sight leaf
            box(0.032, 0.05, 0.045, darkMetal, 0, 0.045, -0.60);      // front sight block
            box(0.008, 0.035, 0.03, darkMetal, -0.015, 0.075, -0.60); // front sight ear L
            box(0.008, 0.035, 0.03, darkMetal, 0.015, 0.075, -0.60);  // front sight ear R
            box(0.008, 0.032, 0.008, darkMetal, 0, 0.076, -0.60);     // front sight post
            tube(0.014, 0.014, 0.30, darkMetal, 0, 0.015, -0.50);     // barrel
            tube(0.021, 0.021, 0.075, darkMetal, 0, 0.015, -0.685);   // muzzle brake
            for (let i = 0; i < 3; i++)                              // brake slots
                box(0.046, 0.01, 0.014, rubber, 0, 0.015, -0.665 - i * 0.018);
            box(0.03, 0.055, 0.045, darkMetal, 0, 0.045, -0.55);     // gas block
            tube(0.013, 0.013, 0.22, darkMetal, 0, 0.062, -0.40);     // gas tube
            box(0.045, 0.03, 0.20, wood, 0, 0.062, -0.40);            // upper handguard
            box(0.056, 0.06, 0.24, wood, 0, -0.008, -0.40);           // lower handguard
            for (let i = 0; i < 3; i++)                              // handguard grooves
                box(0.06, 0.012, 0.01, woodDark, 0, -0.008, -0.34 - i * 0.05);
            tube(0.004, 0.004, 0.38, darkMetal, 0, -0.022, -0.42);    // cleaning rod
            box(0.055, 0.05, 0.07, darkMetal, 0, -0.045, -0.15);      // mag well
            this.magazineParts.push(box(0.05, 0.08, 0.06, gunmetal, 0, -0.075, -0.145, 0.30)); // magazine (curved)
            this.magazineParts.push(box(0.05, 0.08, 0.06, gunmetal, 0, -0.125, -0.12, 0.55));
            this.magazineParts.push(box(0.054, 0.014, 0.064, gunmetal, 0, -0.10, -0.135, 0.42)); // mag rib
            this.magazineParts.push(box(0.054, 0.02, 0.065, darkMetal, 0, -0.165, -0.105, 0.55)); // mag baseplate
            box(0.044, 0.016, 0.09, darkMetal, 0, -0.048, -0.01);     // trigger guard
            box(0.01, 0.03, 0.014, darkMetal, 0, -0.042, -0.015, 0.3); // trigger
            box(0.044, 0.105, 0.052, wood, 0, -0.075, 0.03, -0.38);   // pistol grip
            box(0.056, 0.105, 0.26, wood, 0, -0.012, 0.30, 0.05);     // stock
            box(0.06, 0.125, 0.035, rubber, 0, -0.018, 0.435, 0.05);  // buttpad
            box(0.008, 0.02, 0.09, darkMetal, 0.034, 0.03, -0.05, 0, 0, -0.5); // selector
            this.chargingHandle=box(0.03, 0.018, 0.03, darkMetal, 0.042, 0.035, -0.18);   // charging handle
            pin(0.008, 0.07, darkMetal, 0, 0.01, 0.15, 'x');          // rear trunnion pin
            sightLineY = 0.092; aimDepth = -0.28; tipZ = -0.725; flashY = 0.015;
        } else if (type === 'shotgun') {
            // TOZ-34 over-under: stacked barrels, ventilated top rib, front
            // and mid beads, receiver with top lever and safety, wooden
            // forend and stock, double triggers.
            tube(0.017, 0.017, 0.60, metal, 0, 0.038, -0.28);         // top barrel
            tube(0.017, 0.017, 0.60, metal, 0, 0.002, -0.28);        // bottom barrel
            tube(0.02, 0.02, 0.03, darkMetal, 0, 0.038, -0.575);      // top muzzle ring
            tube(0.02, 0.02, 0.03, darkMetal, 0, 0.002, -0.575);      // bottom muzzle ring
            box(0.014, 0.01, 0.56, darkMetal, 0, 0.06, -0.29);        // top rib
            box(0.008, 0.014, 0.008, darkMetal, 0, 0.07, -0.555);     // front bead
            box(0.006, 0.008, 0.006, darkMetal, 0, 0.068, -0.35);     // mid bead
            box(0.056, 0.095, 0.27, metal, 0, -0.008, 0.085);         // receiver
            box(0.014, 0.012, 0.05, darkMetal, 0.02, 0.045, 0.16);    // top lever
            box(0.012, 0.008, 0.03, darkMetal, 0, 0.042, 0.10);       // safety
            pin(0.01, 0.066, darkMetal, 0, 0.0, 0.02, 'x');           // hinge pin
            box(0.052, 0.06, 0.24, wood, 0, -0.018, -0.28);           // forend
            box(0.04, 0.02, 0.05, darkMetal, 0, -0.03, -0.17);        // forend iron
            box(0.054, 0.105, 0.28, wood, 0, -0.025, 0.35, 0.09);    // stock
            box(0.058, 0.12, 0.035, rubber, 0, -0.035, 0.50, 0.09);   // buttpad
            box(0.042, 0.015, 0.085, darkMetal, 0, -0.06, 0.075);     // trigger guard
            box(0.009, 0.028, 0.012, darkMetal, -0.008, -0.055, 0.075, 0.25); // trigger 1
            box(0.009, 0.028, 0.012, darkMetal, 0.008, -0.055, 0.075, 0.25);  // trigger 2
            sightLineY = 0.077; aimDepth = -0.34; tipZ = -0.59; flashY = 0.038;
        } else if (type === 'sniper') {
            // SVD Dragunov: long barrel with slotted flash hider, backup
            // iron sights, PSO-style scope with turrets and glass, thumbhole
            // stock with cheek rest, ribbed magazine, folded bipod.
            tube(0.013, 0.013, 0.55, darkMetal, 0, 0.015, -0.42);     // barrel
            tube(0.02, 0.02, 0.10, darkMetal, 0, 0.015, -0.72);       // flash hider
            for (let i = 0; i < 3; i++)                              // hider slots
                box(0.044, 0.009, 0.016, rubber, 0, 0.015, -0.70 - i * 0.022);
            box(0.03, 0.04, 0.03, darkMetal, 0, 0.04, -0.60);         // front sight base
            box(0.007, 0.025, 0.007, darkMetal, 0, 0.065, -0.60);    // front sight post
            box(0.058, 0.08, 0.46, metal, 0, 0, -0.02);              // receiver
            box(0.056, 0.012, 0.36, darkMetal, 0, 0.045, -0.05);     // top cover
            box(0.03, 0.025, 0.045, darkMetal, 0, 0.055, -0.20);     // rear sight base
            box(0.02, 0.045, 0.03, darkMetal, 0, 0.065, -0.10);      // scope mount F
            box(0.02, 0.045, 0.03, darkMetal, 0, 0.065, 0.04);       // scope mount R
            tube(0.026, 0.026, 0.26, darkMetal, 0, 0.098, -0.03);    // scope tube
            tube(0.033, 0.026, 0.07, darkMetal, 0, 0.098, -0.185);   // objective bell
            const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), glassMat);
            lens.position.set(0, 0.098, -0.221);                    // front lens
            lens.rotation.y = Math.PI;
            group.add(lens);
            tube(0.024, 0.03, 0.06, rubber, 0, 0.098, 0.125);        // eyepiece
            pin(0.012, 0.03, darkMetal, 0, 0.132, -0.03, 'y');       // elevation turret
            pin(0.012, 0.03, darkMetal, 0.038, 0.098, -0.03, 'x');   // windage turret
            box(0.056, 0.058, 0.28, wood, 0, -0.002, -0.33);         // handguard
            for (let i = 0; i < 4; i++)                             // handguard vents
                box(0.06, 0.01, 0.014, woodDark, 0, 0.012, -0.24 - i * 0.05);
            tube(0.012, 0.012, 0.22, darkMetal, 0, 0.048, -0.33);    // gas tube
            box(0.048, 0.115, 0.062, gunmetal, 0, -0.088, -0.03, 0.22); // magazine
            this.magazineParts.push(box(0.052, 0.018, 0.066, darkMetal, 0, -0.148, -0.017, 0.22)); // mag baseplate
            box(0.044, 0.015, 0.085, darkMetal, 0, -0.055, 0.05);    // trigger guard
            box(0.01, 0.03, 0.013, darkMetal, 0, -0.05, 0.05, 0.3);   // trigger
            box(0.056, 0.055, 0.32, wood, 0, 0.008, 0.36);           // thumbhole stock top
            box(0.05, 0.045, 0.30, wood, 0, -0.095, 0.37, 0.04);     // thumbhole stock bottom
            box(0.062, 0.035, 0.17, woodDark, 0, 0.048, 0.38);       // cheek rest
            box(0.06, 0.13, 0.035, rubber, 0, -0.03, 0.525, 0.04);    // buttpad
            tube(0.006, 0.006, 0.30, darkMetal, -0.035, -0.045, -0.30); // bipod leg L (folded)
            tube(0.006, 0.006, 0.30, darkMetal, 0.035, -0.045, -0.30); // bipod leg R (folded)
            sightLineY = 0.098; aimDepth = -0.29; tipZ = -0.775; flashY = 0.015;
        } else if(this.data.type==='melee'&&this.id!=='knife') {
            box(.035,.035,.65,this.id==='crowbar'?darkMetal:wood,0,0,-.23);
            if(this.id==='sledgehammer')box(.23,.12,.13,metal,0,.015,-.54);
            else if(this.id==='fireaxe'){box(.19,.045,.16,bladeSteel,.06,.01,-.54);box(.09,.07,.12,woodDark,-.03,0,-.54);}
            else {box(.04,.10,.08,darkMetal,0,.035,-.54);box(.06,.022,.10,bladeSteel,0,.075,-.56);}
        } else { // melee - knife
            // Combat knife: fullered blade with clipped point, guard,
            // scaled handle with rivets, pommel.
            box(0.014, 0.05, 0.26, bladeSteel, 0, 0.012, -0.21);      // blade
            box(0.014, 0.032, 0.09, bladeSteel, 0, 0.0, -0.365, -0.55); // clipped point
            box(0.016, 0.012, 0.18, darkMetal, 0, 0.02, -0.19);       // fuller
            box(0.055, 0.018, 0.025, darkMetal, 0, -0.008, -0.065);   // guard
            box(0.032, 0.052, 0.13, polymer, 0, -0.03, 0.02, -0.3);   // handle core
            box(0.038, 0.046, 0.11, woodDark, 0, -0.03, 0.02, -0.3);  // handle scales
            pin(0.005, 0.044, metal, 0, -0.022, -0.005, 'x');        // rivet 1
            pin(0.005, 0.044, metal, 0, -0.035, 0.045, 'x');         // rivet 2
            box(0.04, 0.05, 0.02, darkMetal, 0, -0.048, 0.082, -0.3); // pommel
            sightLineY = 0.0; aimDepth = -0.30; tipZ = -0.40; flashY = 0.015;
        }

        // Distinct silhouettes and moving mechanisms for the additional arsenal.
        if(this.data.shape==='compact'){for(const o of group.children)o.position.z*=.84;tipZ*=.84;}
        if(this.data.shape==='heavy'){for(const o of group.children){o.position.z*=1.12;o.scale.z*=1.12;}tipZ*=1.12;}
        if(this.data.shape==='smg'){for(const o of group.children){o.position.z*=.64;o.scale.z*=.64;}tipZ*=.64;box(.055,.12,.07,polymer,0,-.13,-.10);}
        if(this.data.shape==='carbine'){box(.08,.022,.36,polymer,0,.06,-.20);box(.07,.075,.20,polymer,0,0,-.4);}
        if(this.data.shape==='support'){this.magazineParts.push(box(.15,.15,.10,polymer,0,-.135,-.13));tube(.02,.02,.20,metal,0,.015,-.77);tipZ=-.88;this.actionPart=box(.065,.02,.28,metal,0,.062,-.13);}
        if(this.data.shape==='bolt'){this.actionPart=box(.08,.018,.02,metal,.05,.038,.04);}
        if(this.actionPart){this.actionPart.userData.bindPosition=this.actionPart.position.clone();this.actionPart.userData.bindRotation=this.actionPart.rotation.clone();}

        if(this.chargingHandle)this.chargingHandle.userData.bindPosition=this.chargingHandle.position.clone();
        // Muzzle flash sprite at the barrel tip
        const flashGeom = new THREE.SphereGeometry(0.06, 8, 8);
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0, depthWrite: false });
        this.muzzleFlash = new THREE.Mesh(flashGeom, flashMat);
        this.muzzleFlash.visible = false; // hidden until fired - opacity alone can fail on some GPUs
        this.muzzleFlash.position.set(0, flashY, tipZ);
        this.muzzlePosition.copy(this.muzzleFlash.position);
        group.add(this.muzzleFlash);

        // FPS placement: lower-right, angled inward so the profile reads.
        // Stored as the hip pose; updateVisuals lerps toward the ADS pose.
        this.hipPos = new THREE.Vector3(0.3, -0.27, -0.55);
        this.hipRotY = 0.32;
        this.hipRotX = 0;
        this.sightLineY = sightLineY;
        this.aimDepth = aimDepth;
        group.position.copy(this.hipPos);
        group.scale.setScalar(0.8);
        group.rotation.y = this.hipRotY;

        this.mesh = group;
    }

    /**
     * Attach weapon to the first-person overlay (ViewmodelSystem). The
     * overlay renders in its own scene after the main pass, so the weapon
     * can never clip through walls.
     * @param {THREE.Camera} camera - Player camera (fallback parent)
     */
    attachToCamera(camera) {
        const vm = this.game?.viewmodelSystem;
        if (vm && this.mesh) {
            vm.attach(this.mesh);
        } else if (this.mesh) {
            camera.add(this.mesh); // fallback before the overlay exists
        }
        // Arms match the player's character and are parented to the weapon
        // so they follow recoil, sway and aim transitions exactly
        this.setCharacter(this.game?.character);
    }

    /**
     * Detach weapon from camera
     */
    detach() {
        this.swingRemaining=0;this.swingHitPending=false;
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
    }

    /**
     * Build first-person arms parented to the weapon so they track recoil,
     * sway and aim transitions. Grip points differ per weapon type.
     * @param {Object} character - { skinTone, sleeveColor }
     */
    setCharacter(character) {
        this.hands?.dispose();
        if(character&&this.mesh){this.hands=new FirstPersonHands(this,character);this.armGroup=this.hands.group;}
    }

    /**
     * Try to fire the weapon
     * @returns {boolean} Whether the weapon fired
     */
    fire() {
        if (!this.canFire || this.isReloading) return false;
        if(this.data.type==='melee')return this.swing();
        const player=this.game.player;
        if (player?.isSprinting && Math.hypot(player.velocity.x,player.velocity.z)>0.5 && !this.isAiming) return false;
        
        if (this.currentAmmo <= 0) {
            // Click sound for empty
            globalEventBus.emit('audio:play', {
                sound: this.sounds.empty,
                volume: 0.5
            });
            this.canFire = false;
            this.fireTimer = 0.25;
            return false;
        }
        
        this.canFire = false;
        const fireBonus = this.data.type==='pistol' ? (this.game.perkSystem?.getEffects().pistolFireRate || 0) : 0;
        this.fireTimer = 1 / (this.data.fireRate * (1 + fireBonus));
        this.currentAmmo--;
        for (const entity of this.game.worldManager?.entities.values() || []) {
            entity.hearNoise?.(player.position, this.data.type === 'pistol' ? 55 : 90);
        }
        
        // Apply recoil
        this.applyRecoil();
        // Kick the first-person viewmodel
        try { this.game.viewmodelSystem?.kick(this.data.recoil || 1); } catch (e) {}
        
        // Muzzle flash
        this.showMuzzleFlash();
        
        // Fire sound
        globalEventBus.emit('audio:play', {
            sound: this.sounds.fire,
            volume: 0.8
        });
        
        this.game.inputManager?.recordShot();
        // Spawn projectile/hitscan
        this.performHitscan();
        
        // Emit event
        globalEventBus.emit(GameEvents.WEAPON_FIRE, {
            weapon: this,
            ammoLeft: this.currentAmmo
        });
        
        return true;
    }

    /**
     * Perform hitscan for instant-hit weapons
     */
    swing(){
        this.canFire=false;this.isAiming=false;this.fireTimer=1/this.data.fireRate;
        this.swingRemaining=this.fireTimer;this.swingHitPending=true;
        globalEventBus.emit('audio:play',{sound:'weapon_knife_fire',volume:.45});
        return true;
    }

    performMelee(){
        const camera=this.game.player?.camera;if(!camera)return;
        const direction=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
        // A real swing occupies a short arc instead of a single rifle-like
        // pixel. The rays overlap, so one strike can reach a rear brace after
        // the front plank has fractured without deleting anything behind it.
        const sweep=this.data.shape==='hammer'||this.data.shape==='axe'||this.data.id==='crowbar'?[[-.22,0],[0,0],[.22,0],[0,.16],[0,-.16]]:[[0,0]];
        for(const [x,y]of sweep){const origin=camera.position.clone().addScaledVector(right,x).addScaledVector(up,y),aim=direction.clone().addScaledVector(right,x*.18).addScaledVector(up,y*.18).normalize();this.processHit(new THREE.Raycaster(origin,aim,0,this.data.range),this.data.damage/sweep.length);}
        for(const entity of this.game.worldManager?.entities.values()||[])entity.hearNoise?.(camera.position,12);
    }

    performHitscan() {
        const player = this.game.player;
        if (!player) return;
        
        const camera = player.camera;
        const raycaster = new THREE.Raycaster();
        
        // Get firing direction with accuracy spread
        const movement = Math.min(1, Math.hypot(player.velocity.x, player.velocity.z) / 6);
        const exhaustion = 1 - Math.min(1, player.stats.stamina / player.stats.maxStamina);
        const steady = this.game.bodyMotionSystem?.breathHolding ? 0.55 : 1;
        const crouch = player.isCrouching ? 0.8 : 1;
        const spreadBonus = this.data.type==='rifle' ? (this.game.perkSystem?.getEffects().spread || 0) : 0;
        const spread = (1 - this.data.accuracy) * (this.isAiming ? 0.3 : 1)
            * (1 + movement * 0.7 + exhaustion * 0.35) * steady * crouch * (1+spreadBonus);
        const direction = new THREE.Vector3(0, 0, -1);
        direction.x += (Math.random() - 0.5) * spread;
        direction.y += (Math.random() - 0.5) * spread;
        direction.applyQuaternion(camera.quaternion);
        direction.normalize();
        
        raycaster.set(camera.position, direction);
        raycaster.far = this.data.range;
        
        // Shotgun fires multiple pellets
        if (this.data.pellets) {
            for (let i = 0; i < this.data.pellets; i++) {
                const pelletDir = direction.clone();
                // Pellet spread stays in camera space, including while looking sideways.
                const offset = new THREE.Vector3((Math.random() - 0.5) * this.data.spread,
                    (Math.random() - 0.5) * this.data.spread, 0).applyQuaternion(camera.quaternion);
                pelletDir.add(offset);
                pelletDir.normalize();
                
                const pelletRay = new THREE.Raycaster(camera.position, pelletDir, 0, this.data.range);
                this.processHit(pelletRay, this.data.damage / this.data.pellets);
            }
        } else {
            this.processHit(raycaster, this.data.damage);
        }
    }

    /**
     * Process a raycast hit
     * @param {THREE.Raycaster} raycaster - Raycaster instance
     * @param {number} damage - Damage amount
     */
    processHit(raycaster, damage) {
        const worldManager = this.game.worldManager;
        if (!worldManager) return;
        
        const hit = worldManager.raycast(
            raycaster.ray.origin,
            raycaster.ray.direction,
            this.data.range
        );
        
        if (hit) {
            if(this.game.physicsSystem?.hit(hit,raycaster.ray.direction,this.data.type==='melee'?(this.data.structureDamage??damage):damage))return;
            // Check for entity hit
            let hitEntity = null;
            let current = hit.object;
            
            while (current) {
                if (current.userData?.entityId) {
                    hitEntity = worldManager.entities.get(current.userData.entityId);
                    break;
                }
                current = current.parent;
            }
            
            if (hitEntity && hitEntity.takeDamage) {
                // Calculate damage with distance falloff
                const distance = hit.distance;
                const falloff = Math.max(0.5, 1 - (distance / this.data.range) * 0.5);
                let finalDamage = damage * falloff * (hit.object.userData.hitRegion === 'head' ? 2 : 1);
                const effects=this.game.perkSystem?.getEffects() || {};
                finalDamage *= 1 + (effects[`${this.data.type}Damage`] || 0);
                // Apply powerup damage bonus (capped at +100%)
                if (this.game?.powerupSystem) {
                    const bonus = this.game.powerupSystem.getStat('damage');
                    finalDamage = finalDamage * (1 + Math.min(bonus, 1.0));
                }
                
                const before=hitEntity.health??hitEntity.stats?.health;hitEntity.takeDamage(finalDamage, this.game.player);
                if((hitEntity.health??hitEntity.stats?.health)<before)globalEventBus.emit('combat:confirmed-hit',{position:hit.point,entity:hitEntity});
            }
            
            // Transform face normals from mesh-local space before placing effects.
            const normal = hit.face?.normal?.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
                || new THREE.Vector3(0, 1, 0);
            const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
            const metal = materials.some(m => (m?.metalness || 0) >= 0.4);
            // Spawn impact effect
            globalEventBus.emit('effect:impact', {
                position: hit.point,
                direction:raycaster.ray.direction.clone(),
                normal,
                type: hitEntity ? 'flesh' : metal ? 'metal' : 'default'
            });
        }
    }

    /**
     * Apply recoil effect
     */
    applyRecoil() {
        const recoilAmount = this.data.recoil * (this.isAiming ? 0.5 : 1);
        
        this.recoilOffset.y += recoilAmount;
        this.recoilOffset.z += recoilAmount * 0.5;
        
        // Apply to player camera
        if (this.game.player) {
            this.game.player.cameraPitch += recoilAmount * 0.5;
            this.game.player.cameraYaw += (Math.random() - 0.5) * recoilAmount * 0.3;
        }
    }

    /**
     * Show muzzle flash effect
     */
    showMuzzleFlash() {
        if (this.muzzleFlash) {
            this.muzzleFlash.visible = true;
            this.muzzleFlash.material.opacity = 1;
            this.muzzleFlash.scale.setScalar(1 + Math.random() * 0.5);
            
            // Hide after short delay
            const flash = this.muzzleFlash;
            setTimeout(() => {
                flash.visible = false;
                flash.material.opacity = 0;
            }, 50);
        }
    }

    /**
     * Start reloading
     */
    reload() {
        if(this.data.type==='melee')return;
        if (this.isReloading) return;
        if (this.currentAmmo >= this.data.magazineSize) return;
        if (this.reserveAmmo <= 0) return;
        
        this.isReloading = true;
        this.isAiming=false;
        this.reloadProgress = 0;
        
        // Reload sound
        globalEventBus.emit('audio:play', {
            sound: this.sounds.reload,
            volume: 0.6
        });
        
        globalEventBus.emit(GameEvents.WEAPON_RELOAD, { weapon: this });
    }

    /**
     * Complete the reload
     */
    finishReload() {
        const ammoNeeded = this.data.magazineSize - this.currentAmmo;
        const ammoToLoad = Math.min(ammoNeeded, this.reserveAmmo);
        
        this.currentAmmo += ammoToLoad;
        this.reserveAmmo -= ammoToLoad;
        this.isReloading = false;
        this.reloadProgress = 0;
    }

    /**
     * Add ammo to reserve
     * @param {number} amount - Amount to add
     */
    addAmmo(amount) {
        this.reserveAmmo += amount;
    }

    /**
     * Set aiming state
     * @param {boolean} aiming - Whether aiming
     */
    setAiming(aiming) {
        this.isAiming = aiming&&!this.isReloading;
    }

    /**
     * Update weapon state
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        if(this.swingRemaining>0){this.swingRemaining=Math.max(0,this.swingRemaining-deltaTime);if(this.swingHitPending&&this.swingRemaining<=.65/this.data.fireRate){this.swingHitPending=false;this.performMelee();}}
        // Update fire timer
        if (!this.canFire) {
            this.fireTimer -= deltaTime;
            if (this.fireTimer <= 0) {
                this.canFire = true;
            }
        }
        
        // Update reload
        if (this.isReloading) {
            this.reloadProgress += deltaTime * (1 + (this.game.perkSystem?.getEffects().reloadSpeed || 0)) / this.data.reloadTime;
            if (this.reloadProgress >= 1) {
                this.finishReload();
            }
        }
        
        // Update visual effects
        this.updateVisuals(deltaTime);
    }

    /**
     * Update weapon visuals (sway, recoil recovery, etc.)
     * @param {number} deltaTime - Frame delta
     */
    updateVisuals(deltaTime) {
        if (!this.mesh) return;

        // Recover from recoil
        this.recoilOffset.lerp(new THREE.Vector3(), 10 * deltaTime);

        // Aim transition
        const targetAimProgress = this.isAiming ? 1 : 0;
        this.aimProgress = THREE.MathUtils.lerp(this.aimProgress, targetAimProgress, 10 * deltaTime);
        const a = this.aimProgress;

        // ADS pose: shift the group so the weapon's sight line lands exactly
        // on the camera's forward axis (the crosshair) and straighten the hip
        // yaw - otherwise the bore points off-axis and the sights sit away
        // from the crosshair. Hip pose keeps the angled-inward profile read.
        const s = this.mesh.scale.y || 1;
        _aimPos.set(0, -(this.sightLineY || 0) * s, this.aimDepth ?? -0.3);

        this.mesh.position.lerpVectors(this.hipPos, _aimPos, a);
        this.mesh.rotation.y = THREE.MathUtils.lerp(this.hipRotY, 0, a);
        this.mesh.rotation.x = THREE.MathUtils.lerp(this.hipRotX || 0, 0, a);
        if(this.data.type==='melee'&&this.swingRemaining>0){const phase=1-this.swingRemaining*this.data.fireRate,arc=Math.sin(phase*Math.PI);this.mesh.rotation.x-=arc*.95;this.mesh.rotation.y+=arc*.5;this.mesh.position.z-=arc*.18;}

        // Apply recoil offset
        this.mesh.position.addScaledVector(this.recoilOffset,motionScale(this.game.settings,'weaponMotion'));

        // Weapon sway (reduced when aiming)
        const swayAmount = (1 - a * 0.8) * 0.002;
        const time = performance.now() * 0.001;
        this.swayOffset.x = Math.sin(time * 1.5) * swayAmount;
        this.swayOffset.y = Math.cos(time * 2) * swayAmount;

        this.mesh.position.addScaledVector(this.swayOffset,motionScale(this.game.settings,'weaponMotion'));
        this.hands?.update();
        this.updateMechanism();
    }

    /**
     * Get weapon info for UI
     */
    updateMechanism() {
        if(this.chargingHandle){this.chargingHandle.position.copy(this.chargingHandle.userData.bindPosition);const p=this.reloadProgress;this.chargingHandle.position.z+=this.isReloading&&p>.76&&p<.9?Math.sin((p-.76)/.14*Math.PI)*.08:0;}
        const mechanism=this.data.shape;
        if(this.actionPart) {
            const part=this.actionPart,p=this.reloadProgress,fire=Math.max(0,1-this.fireTimer/Math.max(.001,1/this.data.fireRate));
            part.position.copy(part.userData.bindPosition);part.rotation.copy(part.userData.bindRotation);
            if(mechanism==='revolver'&&this.isReloading){part.position.x-=Math.sin(p*Math.PI)*.08;part.rotation.x+=p*Math.PI*2;}
            if(mechanism==='pump')part.position.z+=Math.sin(fire*Math.PI)*.09;
            if(mechanism==='bolt'){part.position.z+=Math.sin(fire*Math.PI)*.09;part.rotation.z=Math.sin(fire*Math.PI)*.55;}
            if(mechanism==='support'&&this.isReloading)part.rotation.x=Math.sin(p*Math.PI)*.65;
        }
        for(const part of this.magazineParts||[]) {
            part.userData.bindPosition ||= part.position.clone();
            part.position.copy(part.userData.bindPosition);
            const p=this.reloadProgress;
            if(this.isReloading) {
                const pull=p<.35?THREE.MathUtils.smoothstep(p,.17,.35):1-THREE.MathUtils.smoothstep(p,.48,.65);
                const well=HANDLING_PROFILES[this.id]?.well || (this.data.type==='pistol'?[.015,-.16,.06]:[.015,-.14,-.12]);
                if(this.hands)part.position.addScaledVector(this.hands.hands.L.position.clone().sub(new THREE.Vector3(...well)),pull);
                part.visible=p<.35||p>.48;
            } else part.visible=true;
        }
    }

    getInfo() {
        return {
            name: this.data.name,
            currentAmmo: this.currentAmmo,
            reserveAmmo: this.reserveAmmo,
            magazineSize: this.data.magazineSize,
            isReloading: this.isReloading,
            reloadProgress: this.reloadProgress
        };
    }
}

/**
 * WeaponManager - Manages player weapons
 */
export class WeaponManager {
    constructor(game) {
        this.game = game;
        this.weapons = new Map();
        this.equippedWeapon = null;
        this.weaponSlots = [null, null, null]; // Primary, Secondary, Melee
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        globalEventBus.on('item:equip', (data) => {
            if (data.item.type === 'weapon') {
                this.equipWeapon(data.item.weaponId);
            }
        });
    }

    /**
     * Add a weapon to inventory
     * @param {string} weaponId - Weapon ID
     * @param {number} slot - Slot index
     */
    addWeapon(weaponId, slot = -1) {
        if (this.weapons.has(weaponId)) return;
        
        const weapon = new Weapon(weaponId, this.game);
        weapon.setCharacter(this.game.character||{skinTone:0xc9a186,sleeveColor:0x4a5240});
        this.weapons.set(weaponId, weapon);
        
        // Auto-assign to slot
        if (slot === -1) {
            const weaponType = weapon.data.type;
            if (weaponType === 'melee') {
                slot = 2;
            } else if (weaponType === 'pistol') {
                slot = 1;
            } else {
                slot = 0;
            }
        }
        
        if (slot >= 0 && slot < this.weaponSlots.length) {
            this.weaponSlots[slot] = weaponId;
        }
        
        return weapon;
    }

    /**
     * Equip a weapon
     * @param {string} weaponId - Weapon ID
     */
    equipWeapon(weaponId) {
        if(!this.weapons.has(weaponId)&&WeaponData[weaponId])this.addWeapon(weaponId);
        const weapon = this.weapons.get(weaponId);
        if (!weapon) return;
        
        // Unequip current
        if (this.equippedWeapon) {
            this.equippedWeapon.detach();
        }
        
        this.equippedWeapon = weapon;
        
        // Attach to camera
        if (this.game.player?.camera) {
            weapon.attachToCamera(this.game.player.camera);
        }
        
        // Equip sound
        globalEventBus.emit('audio:play', {
            sound: weapon.sounds.equip,
            volume: 0.5
        });
        
        globalEventBus.emit(GameEvents.WEAPON_SWITCH, { weapon });
    }

    /**
     * Equip weapon by slot
     * @param {number} slot - Slot index
     */
    equipSlot(slot) {
        if (slot < 0 || slot >= this.weaponSlots.length) return;
        
        const weaponId = this.weaponSlots[slot];
        if (weaponId) {
            this.equipWeapon(weaponId);
        }
    }

    /**
     * Remove every weapon (fresh start). Detaches viewmodels from the camera.
     */
    clearAll() {
        for (const weapon of this.weapons.values()) {
            weapon.hands?.dispose();weapon.detach();
            const materials=new Set();weapon.mesh.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});
            for(const material of materials)material.dispose();
        }
        this.weapons.clear();
        this.weaponSlots = [null, null, null];
        this.equippedWeapon = null;
    }

    removeWeapon(id) {
        const weapon=this.weapons.get(id);if(!weapon)return;
        weapon.hands?.dispose();weapon.detach();
        const materials=new Set();weapon.mesh.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});
        for(const material of materials)material.dispose();
        this.weapons.delete(id);this.weaponSlots=this.weaponSlots.map(slot=>slot===id?null:slot);
        if(this.equippedWeapon===weapon){this.equippedWeapon=null;if(this.game.player)this.game.player.equippedWeapon=null;const next=this.weapons.keys().next().value;if(next)this.equipWeapon(next);}
    }

    /**
     * Add ammo to a weapon
     * @param {string} ammoType - Ammo type
     * @param {number} amount - Amount to add
     */
    addAmmo(ammoType, amount) {
        for (const weapon of this.weapons.values()) {
            if (weapon.data.ammoType === ammoType) {
                weapon.addAmmo(amount);
            }
        }
    }

    /**
     * Update equipped weapon
     * @param {number} deltaTime - Frame delta
     */
    update(deltaTime) {
        if (this.equippedWeapon) {
            this.equippedWeapon.update(deltaTime);
            
            // Update player reference
            if (this.game.player) {
                this.game.player.equippedWeapon = this.equippedWeapon;
            }
        }
    }

    dispose() {
        this.clearAll();
    }
}
