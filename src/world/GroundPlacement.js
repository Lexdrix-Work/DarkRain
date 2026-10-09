import * as THREE from 'three';

/** Seat geometry on its support surface using transformed bounds. */
export function seatOnGround(object, heightAt, clearance = 0.015) {
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return object.position.y;
    const support = Math.max(
        heightAt(bounds.min.x, bounds.min.z), heightAt(bounds.min.x, bounds.max.z),
        heightAt(bounds.max.x, bounds.min.z), heightAt(bounds.max.x, bounds.max.z),
        heightAt(object.position.x, object.position.z)
    );
    object.position.y += support - bounds.min.y + clearance;
    object.updateMatrixWorld(true);
    return object.position.y;
}
