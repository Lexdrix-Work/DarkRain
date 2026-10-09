import * as THREE from 'three';

/** One draw per building; each pane retains its own breakable collider and hit index. */
export function addGlassWindows(world,building,panes) {
    if(!world.materials.clearGlass) {
        const glass=new THREE.MeshStandardMaterial({color:0xd9e5e2,transparent:true,opacity:.07,roughness:.08,metalness:.2,depthWrite:false,side:THREE.DoubleSide});
        // Clear head-on, increasingly reflective at grazing angles.
        glass.userData.fresnelGlass=true;
        glass.customProgramCacheKey=()=> 'clear-glass-fresnel';world.materials.clearGlass=glass;
    }
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),world.materials.clearGlass,panes.length);
    mesh.name='clear-window-panes';mesh.userData.isCollidable=true;mesh.userData.glassWindows=true;mesh.userData.panes=[];
    const q=building.getWorldQuaternion(new THREE.Quaternion());
    const location=building.getWorldPosition(new THREE.Vector3());
    mesh.userData.glassId=`${location.x.toFixed(2)},${location.z.toFixed(2)}`;
    for(let i=0;i<panes.length;i++) {
        const pane=panes[i],position=new THREE.Vector3(...pane.position).applyMatrix4(building.matrixWorld),size=new THREE.Vector3(...pane.size);
        const matrix=new THREE.Matrix4().compose(position,q,size);mesh.setMatrixAt(i,matrix);
        mesh.userData.panes.push({position,size,quaternion:q.clone(),matrix,broken:false});
    }
    mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.updateMatrixWorld(true);
    world.scene.add(mesh);world._cityObjects.push(mesh);world.colliders.push(mesh);return mesh;
}

export function breakPane(mesh,index) {
    const pane=mesh.userData.panes?.[index];if(!pane||pane.broken)return false;
    pane.broken=true;mesh.setMatrixAt(index,new THREE.Matrix4().makeScale(0,0,0));mesh.instanceMatrix.needsUpdate=true;return true;
}
