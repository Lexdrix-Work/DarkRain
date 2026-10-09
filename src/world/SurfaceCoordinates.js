import * as THREE from 'three';
/** Rest-space coordinates keep texture scale stable as shards rotate and settle. */
export function surfaceCoordinates(geometry,size){const p=geometry.attributes.position,data=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){data[i*3]=p.getX(i)*size.x;data[i*3+1]=p.getY(i)*size.y;data[i*3+2]=p.getZ(i)*size.z;}geometry.setAttribute('surfacePosition',new THREE.Float32BufferAttribute(data,3));if(!geometry.attributes.fractureFace)geometry.setAttribute('fractureFace',new THREE.Float32BufferAttribute(new Float32Array(p.count),1));return geometry;}
