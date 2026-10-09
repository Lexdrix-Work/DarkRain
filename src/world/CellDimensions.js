import * as THREE from 'three';
/** Separate size attribute avoids rebinding the renderer's internal instance matrix. */
export function attachCellDimensions(mesh){
    const sizes=new THREE.InstancedBufferAttribute(new Float32Array(mesh.count*3),3);
    mesh.geometry.setAttribute('cellSize',sizes);
    const write=mesh.setMatrixAt.bind(mesh);
    mesh.setMatrixAt=(index,matrix)=>{
        write(index,matrix);const e=matrix.elements;
        sizes.setXYZ(index,Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10]));sizes.needsUpdate=true;
    };
}
