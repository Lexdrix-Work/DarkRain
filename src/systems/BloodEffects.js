import * as THREE from 'three';

/** Bounded droplets and terrain/surface stains. No animation timers per hit. */
export class BloodEffects {
    constructor(game) {
        this.game=game;this.scene=game.scene;this.capacity=256;this.cursor=0;this.drops=[];this.stains=[];
        const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
        ctx.fillStyle='rgba(115,9,12,.85)';ctx.beginPath();ctx.ellipse(64,64,30,22,.3,0,Math.PI*2);ctx.fill();
        for(let i=0;i<90;i++){const a=i*2.3999,r=Math.sqrt((i%31)/31)*54;ctx.beginPath();ctx.arc(64+Math.cos(a)*r,64+Math.sin(a)*r,.8+(i%5),0,Math.PI*2);ctx.fill();}
        this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
        const dot=document.createElement('canvas');dot.width=dot.height=16;const d=dot.getContext('2d');d.fillStyle='white';d.beginPath();d.arc(8,8,7,0,Math.PI*2);d.fill();
        this.dot=new THREE.CanvasTexture(dot);
        this.positions=new Float32Array(this.capacity*3);this.positions.fill(-10000);
        this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));
        this.material=new THREE.PointsMaterial({color:0x6a0710,map:this.dot,size:.027,transparent:true,alphaTest:.1,depthWrite:false});
        this.points=new THREE.Points(this.geometry,this.material);this.points.frustumCulled=false;this.points.raycast=()=>{};this.scene.add(this.points);
    }
    stain(position,normal,size=.35) {
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshStandardMaterial({map:this.texture,transparent:true,roughness:.36,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide}));
        mesh.position.copy(position).addScaledVector(normal,.007);mesh.lookAt(position.clone().add(normal));mesh.rotateZ(Math.random()*Math.PI*2);mesh.raycast=()=>{};
        this.scene.add(mesh);this.stains.push({mesh,age:0});
        while(this.stains.length>64)this.removeStain(this.stains.shift());
    }
    spray(position,normal,direction) {
        const ground=this.game.worldManager?.getTerrainHeight(position.x,position.z)??0;
        this.stain(new THREE.Vector3(position.x,ground,position.z),new THREE.Vector3(0,1,0),.25+Math.random()*.25);
        if(direction) {
            const ray=new THREE.Raycaster(position.clone().addScaledVector(direction,.05),direction,.05,2.5);
            const walls=this.game.worldManager?.getNearbyColliders(position,3)||[];
            const hit=ray.intersectObjects(walls,true)[0];
            if(hit){const n=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));this.stain(hit.point,n,.38);}
        }
        for(let i=0;i<22;i++) {
            const index=this.cursor++%this.capacity;
            this.drops[index]={position:position.clone(),velocity:normal.clone().multiplyScalar(1+Math.random()*2).add(new THREE.Vector3((Math.random()-.5)*2,Math.random()*2,(Math.random()-.5)*2)),age:0};
            position.toArray(this.positions,index*3);
        }
        this.geometry.attributes.position.needsUpdate=true;
    }
    update(dt) {
        for(let i=0;i<this.drops.length;i++) {
            const drop=this.drops[i];if(!drop)continue;drop.age+=dt;drop.velocity.y-=9.8*dt;drop.position.addScaledVector(drop.velocity,dt);
            const floor=this.game.worldManager?.getTerrainHeight(drop.position.x,drop.position.z)??0;
            if(drop.age>1.2||drop.position.y<floor){this.drops[i]=null;this.positions.fill(-10000,i*3,i*3+3);}else drop.position.toArray(this.positions,i*3);
        }
        this.geometry.attributes.position.needsUpdate=true;
        for(const stain of [...this.stains]){stain.age+=dt;stain.mesh.material.opacity=Math.min(1,(120-stain.age)/15);if(stain.age>=120){this.removeStain(stain);this.stains.splice(this.stains.indexOf(stain),1);}}
    }
    removeStain(s){s.mesh.removeFromParent();s.mesh.geometry.dispose();s.mesh.material.dispose();}
    clear(){for(const s of this.stains)this.removeStain(s);this.stains=[];this.drops=[];this.positions.fill(-10000);this.geometry.attributes.position.needsUpdate=true;}
    dispose(){this.clear();this.points.removeFromParent();this.geometry.dispose();this.material.dispose();this.texture.dispose();this.dot.dispose();}
}
