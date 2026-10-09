import * as THREE from 'three';
/** Exact union of touching boxes with identical cross-sections and orientation.
 * Leaves door/window voids and damaged gaps open; only collider subdivision is
 * reduced. Render geometry, member IDs, health and retained mass are untouched. */
export function mergeCollisionBoxes(members){
    let boxes=members.map(m=>({position:m.local.clone().applyQuaternion(m.cell.pane.quaternion.clone().invert()),size:m.cell.pane.size.clone(),rotation:m.cell.pane.quaternion.clone()}));
    for(let pass=0;pass<2;pass++)for(let axis=0;axis<3;axis++){
        const groups=new Map(),u=(axis+1)%3,v=(axis+2)%3;
        for(const b of boxes){
            const key=b.rotation.toArray().map(n=>n.toFixed(5)).join(',')+'/'+[b.position.getComponent(u),b.position.getComponent(v),b.size.getComponent(u),b.size.getComponent(v)].map(n=>n.toFixed(5)).join('|');let list=groups.get(key);if(!list){list=[];groups.set(key,list);}list.push(b);
        }
        const merged=[];for(const list of groups.values()){list.sort((a,b)=>a.position.getComponent(axis)-b.position.getComponent(axis));let current=list[0];
            for(let i=1;i<list.length;i++){const next=list[i],end=current.position.getComponent(axis)+current.size.getComponent(axis)/2,start=next.position.getComponent(axis)-next.size.getComponent(axis)/2;
                if(Math.abs(start-end)<.00001){const lower=current.position.getComponent(axis)-current.size.getComponent(axis)/2,upper=next.position.getComponent(axis)+next.size.getComponent(axis)/2;current.position.setComponent(axis,(lower+upper)/2);current.size.setComponent(axis,upper-lower);}else{merged.push(current);current=next;}
            }merged.push(current);
        }boxes=merged;
    }for(const b of boxes)b.position.applyQuaternion(b.rotation);return boxes;
}
