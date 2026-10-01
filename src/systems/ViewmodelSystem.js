import * as THREE from 'three';

/**
 * ViewmodelSystem - First-person overlay renderer.
 *
 * Weapon viewmodels used to be children of the player camera, so walking up
 * to a wall pushed the gun *through* the wall (same depth buffer, same near
 * plane). This system renders all first-person geometry (weapon, arms, hat
 * brim) in a dedicated overlay scene with its own camera, drawn after the
 * main pass with the depth buffer cleared. The viewmodel can never clip
 * into world geometry again, and it keeps its own near/far + lighting.
 */
export class ViewmodelSystem {
    constructor(game) {
        this.game = game;

        this.vmScene = new THREE.Scene();
        // No fog in the overlay - the gun is 50cm away
        this.vmScene.fog = null;

        this.vmCamera = new THREE.PerspectiveCamera(75, 1, 0.01, 30);
        // Rig holds weapon + arms + hat at the exact local offsets the old
        // camera-child setup used, so placement tuning carries over unchanged
        this.rig = new THREE.Group();
        this.vmCamera.add(this.rig);
        this.vmScene.add(this.vmCamera);

        // Overlay lighting: soft hemisphere so standard materials read
        // correctly + the warm fill the old camera light provided.
        // NOTE: these are children of the overlay CAMERA (not the scene),
        // because the camera teleports to the player's world position each
        // frame - scene-space lights would be left behind at the origin.
        const hemi = new THREE.HemisphereLight(0x9aa4b5, 0x3a352c, 0.55);
        this.vmCamera.add(hemi);
        const fill = new THREE.PointLight(0xfff0dd, 0.9, 3, 1.6);
        fill.position.set(0.15, 0.1, 0.15);
        this.vmCamera.add(fill);
        // Key light from upper-left so the gun has form even at night
        const key = new THREE.DirectionalLight(0xdfe8ff, 0.35);
        key.position.set(-0.5, 1, 0.5);
        this.vmCamera.add(key);

        this.hatBrim = null;
        this.character = null;
    }

    /** Attach a weapon group (or any FP object) to the overlay rig */
    attach(obj) {
        if (obj) this.rig.add(obj);
    }

    /** Remove everything the rig holds (weapon swaps call detach themselves) */
    clear() {
        for (let i = this.rig.children.length - 1; i >= 0; i--) {
            const child = this.rig.children[i];
            if (child !== this.hatBrim) {
                this.rig.remove(child);
            }
        }
    }

    /**
     * Apply the player's character customization: rebuild the hat brim
     * visible when looking down. Arms are built per-weapon (see
     * Weapon.setCharacter) so they follow recoil and aim motion.
     */
    setCharacter(character) {
        this.character = character || ViewmodelSystem.defaultCharacter();
        this._buildHatBrim();
        // Push to every known weapon so arms match on next equip
        for (const weapon of this.game.weaponManager?.weapons.values() || []) {
            weapon.setCharacter(this.character);
        }
    }

    static defaultCharacter() {
        return { hat: 'cap', skinTone: 0xc9a186, sleeveColor: 0x4a5240, name: 'Stalker' };
    }

    _buildHatBrim() {
        if (this.hatBrim) {
            this.rig.remove(this.hatBrim);
            this.hatBrim = null;
        }
        const hat = HatFactory.build(this.character.hat, this.character);
        if (!hat) return;
        // Brim sits just above the eyes; only the front edge peeks into view
        // when the player pitches down
        hat.position.set(0, 0.16, -0.02);
        hat.traverse(o => {
            if (o.isMesh) {
                o.castShadow = false; o.receiveShadow = false;
                o.material.transparent = true;
            }
        });
        hat.visible = false;
        this.hatBrim = hat;
        this.rig.add(hat);
    }

    update(deltaTime) {
        // Fade the hat brim in as the player looks down past ~-20 degrees
        if (this.hatBrim) {
            const pitch = this.game.player?.cameraPitch || 0;
            const target = pitch < -0.35 ? Math.min(1, (-pitch - 0.35) * 2.5) : 0;
            this.hatBrim.visible = target > 0.01;
            this.hatBrim.traverse(o => {
                if (o.isMesh) o.material.opacity = target;
            });
        }
    }

    render(renderer) {
        const cam = this.game.player?.camera;
        if (!cam) return;
        // Mirror the main camera exactly
        cam.getWorldPosition(this.vmCamera.position);
        cam.getWorldQuaternion(this.vmCamera.quaternion);
        if (this.vmCamera.fov !== cam.fov) {
            this.vmCamera.fov = cam.fov;
            this.vmCamera.updateProjectionMatrix();
        }
        const w = renderer.domElement.width, h = renderer.domElement.height;
        const aspect = w / Math.max(1, h);
        if (Math.abs(this.vmCamera.aspect - aspect) > 0.001) {
            this.vmCamera.aspect = aspect;
            this.vmCamera.updateProjectionMatrix();
        }
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(this.vmScene, this.vmCamera);
        renderer.autoClear = autoClear;
    }
}

/**
 * HatFactory - procedural hats for the character creator + FP brim.
 * Each hat is built around the origin (head center); the creator preview
 * shows the full hat, the FP brim shows the same geometry from inside.
 */
export const HATS = [
    { id: 'cap', name: 'Baseball Cap', color: 0x3a4a3a },
    { id: 'beanie', name: 'Beanie', color: 0x5a3a2a },
    { id: 'boonie', name: 'Boonie Hat', color: 0x6a6a4a },
    { id: 'ushanka', name: 'Ushanka', color: 0x4a3a30 },
    { id: 'helmet', name: 'Combat Helmet', color: 0x3f4438 },
    { id: 'hood', name: 'Hood', color: 0x2e3138 },
];

export class HatFactory {
    static build(hatId, character = {}) {
        const def = HATS.find(h => h.id === hatId) || HATS[0];
        const color = character.hatColor || def.color;
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
        const g = new THREE.Group();

        if (hatId === 'cap') {
            const crown = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
            crown.position.y = 0.02;
            g.add(crown);
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.02, 16, 1, false, -Math.PI / 2.6, Math.PI / 1.3), mat);
            brim.position.set(0, 0.02, -0.12);
            brim.scale.set(1, 1, 1.6);
            g.add(brim);
            const button = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), mat);
            button.position.y = 0.15;
            g.add(button);
        } else if (hatId === 'beanie') {
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), mat);
            dome.position.y = 0.01;
            g.add(dome);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.028, 8, 20), mat);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = 0.0;
            g.add(rim);
        } else if (hatId === 'boonie') {
            const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.1, 16), mat);
            crown.position.y = 0.06;
            g.add(crown);
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.02, 20), mat);
            brim.position.y = 0.01;
            g.add(brim);
        } else if (hatId === 'ushanka') {
            const crown = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
            crown.position.y = 0.02;
            crown.scale.y = 1.15;
            g.add(crown);
            const flapF = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.03), mat);
            flapF.position.set(0, -0.03, -0.13);
            g.add(flapF);
            const flapB = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.03), mat);
            flapB.position.set(0, -0.03, 0.13);
            g.add(flapB);
        } else if (hatId === 'helmet') {
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.9), mat);
            shell.position.y = 0.03;
            g.add(shell);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.018, 8, 22), mat);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = 0.015;
            g.add(rim);
            // cover bands
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.012, 6, 22), new THREE.MeshStandardMaterial({ color: 0x2c2f26, roughness: 1 }));
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.09;
            g.add(band);
        } else { // hood
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.6), mat);
            hood.position.y = 0.02;
            hood.scale.set(1, 1.1, 1.05);
            g.add(hood);
            const opening = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 20), mat);
            opening.position.set(0, 0.0, -0.1);
            g.add(opening);
        }
        return g;
    }
}
