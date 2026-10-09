import * as THREE from 'three';

/** Batched city fittings stay cheap while attached, then become retained rigid bodies. */
export class FallingDecorations {
    constructor(physics) {
        this.physics=physics;this.owners=new Map();this.clock=0;this.pending=[];
        physics.game.scene.traverse(mesh=>{for(const range of mesh.userData.decorationRanges||[]){let list=this.owners.get(range.owner);if(!list){list=[];this.owners.set(range.owner,list);}list.push({...range,mesh});}});
    }
    prepare(part) {
        if(part.original)return;
        const geometry=part.mesh.geometry,p=geometry.attributes.position;
        part.original=p.array.slice(part.start*3,(part.start+part.count)*3);
        const box=new THREE.Box3();for(let i=0;i<part.count;i++)box.expandByPoint(new THREE.Vector3().fromArray(part.original,i*3));
        part.center=box.getCenter(new THREE.Vector3());part.half=box.getSize(new THREE.Vector3()).multiplyScalar(.5);
        const cells=this.physics.structure?.groups.get(part.owner)||[];
        // Attachment candidates are local: losing one facade bay releases its fittings.
        part.supports=cells.filter(({pane:p})=>Math.abs(part.center.x-p.position.x)<=part.half.x+p.size.x/2+.3&&Math.abs(part.center.z-p.position.z)<=part.half.z+p.size.z/2+.3&&Math.abs(part.center.y-p.position.y)<=part.half.y+p.size.y/2+.4);
    }
    queue(part){if(part.record||part.queued)return;this.prepare(part);part.queued=true;this.pending.push(part);}
    start(owner){for(const part of this.owners.get(owner)||[])this.queue(part);}
    promote(part) {
        const geometry=new THREE.BufferGeometry(),source=part.mesh.geometry;
        for(const [name,a]of Object.entries(source.attributes)){
            if(a.count!==source.attributes.position.count)continue;
            geometry.setAttribute(name,new THREE.BufferAttribute(a.array.slice(part.start*a.itemSize,(part.start+part.count)*a.itemSize),a.itemSize,a.normalized));
        }
        geometry.translate(-part.center.x,-part.center.y,-part.center.z);geometry.computeBoundingBox();geometry.computeBoundingSphere();
        const material=part.mesh.material.clone(),mesh=new THREE.Mesh(geometry,material);
        mesh.position.copy(part.center);mesh.castShadow=mesh.receiveShadow=true;this.physics.game.scene.add(mesh);
        const size=part.half.clone().multiplyScalar(2),volume=Math.max(.00001,size.x*size.y*size.z),density=material.metalness>.25?2700:650;
        // Convex geometry retains the authored silhouette, rather than a replacement block.
        part.record=this.physics.addBody(mesh,new THREE.Vector3(1,1,1),{kind:'city-fitting',id:`fitting:${part.owner}:${part.mesh.userData.type}:${part.start}`,mass:volume*density,convex:true});
        part.record.boundsSize=size;part.queued=false;
        const p=source.attributes.position;for(let i=0;i<part.count;i++)p.setXYZ(part.start+i,part.center.x,part.center.y,part.center.z);p.needsUpdate=true;
        this.physics.game.renderer.shadowMap.needsUpdate=true;
    }
    update(dt) {
        this.clock+=dt;
        if(this.clock>.3){this.clock=0;for(const [id,parts]of this.owners){const cells=this.physics.structure?.groups.get(id);if(!cells?.length||!cells.some(c=>c.pane.broken||c.pane.pendingColliderDisabled))continue;
            for(const part of parts){if(part.record||part.queued)continue;this.prepare(part);const supports=part.supports.length?part.supports:cells;
                if(supports.every(c=>c.pane.broken||c.pane.pendingColliderDisabled))this.queue(part);}
        }}
        // Bound promotion work, never delete overflow or freeze it in mid-air.
        for(let i=0;i<4&&this.pending.length;i++)this.promote(this.pending.shift());
    }
    serialize(){return [...this.owners.values()].flat().filter(p=>p.record||p.queued).map(p=>({owner:p.owner,start:p.start,bucket:p.mesh.userData.type,queued:!!p.queued,
        position:p.record?new THREE.Vector3().copy(p.record.body.translation()).toArray():p.center.toArray(),rotation:p.record?new THREE.Quaternion().copy(p.record.body.rotation()).toArray():[0,0,0,1],
        velocity:p.record?.body.linvel(),angular:p.record?.body.angvel(),sleeping:p.record?.body.isSleeping()}));}
    restore(data){for(const state of data||[]){const part=this.owners.get(state.owner)?.find(p=>p.start===state.start&&p.mesh.userData.type===state.bucket);if(!part)continue;this.prepare(part);
        if(state.queued){this.queue(part);continue;}this.promote(part);const r=part.record,q=new THREE.Quaternion().fromArray(state.rotation||[0,0,0,1]);
        r.mesh.position.fromArray(state.position);r.mesh.quaternion.copy(q);r.body.setTranslation(r.mesh.position,true);r.body.setRotation(q,true);r.previous.copy(r.mesh.position);r.previousRotation.copy(q);
        // Accept previous visual-only saves without manufacturing horizontal motion.
        r.body.setLinvel(typeof state.velocity==='number'?{x:0,y:state.velocity,z:0}:state.velocity||{x:0,y:0,z:0},true);r.body.setAngvel(state.angular||{x:0,y:0,z:0},true);if(state.sleeping)r.body.sleep();}}
    restoreOriginal(){for(const list of this.owners.values())for(const part of list)if(part.original){part.mesh.geometry.attributes.position.array.set(part.original,part.start*3);part.mesh.geometry.attributes.position.needsUpdate=true;}this.pending=[];}
}
