/** Coverage is distinct from demolition proof. Never turn an unmeasured scene into a pass. */
export function cityDestructionCoverage(world,physics){
    const buildings=(world.buildingSpots||[]).map(spot=>{
        const id=spot.structureId||`structure:${spot.x.toFixed(2)},${spot.z.toFixed(2)}`,cells=physics.structure?.groups.get(id)||[];
        return {id,x:spot.x,z:spot.z,width:spot.width,depth:spot.depth,floors:spot.floors??null,architecture:spot.architecture??'unknown',neighborhood:spot.neighborhood??null,cells:cells.length,anchors:cells.filter(c=>c.pane.anchor).length,backend:cells.length?'generated-support-graph':'none',physicalFixedJoints:false,blocking:cells.length?['city fixed-joint load lifecycle absent']:['building missing structural graph']};
    });
    const required=['high-rise','wood-frame house','parking garage'];
    const exemplars={
        'high-rise':buildings.filter(b=>b.floors>=10).sort((a,b)=>b.floors-a.floors)[0]?.id||null,
        // Do not relabel a short masonry shop as a wood-frame home or garage.
        'wood-frame house':buildings.find(b=>b.architecture==='wood-frame-house')?.id||null,
        'parking garage':buildings.find(b=>b.architecture==='parking-garage')?.id||null,
    };
    const sorted=[...buildings].sort((a,b)=>(a.floors??0)-(b.floors??0)||a.id.localeCompare(b.id)),selected=new Set();
    for(const candidate of [sorted.at(-1),sorted[0],[...sorted].sort((a,b)=>b.width*b.depth-a.width*a.depth).find(b=>!selected.has(b.id))])if(candidate)selected.add(candidate.id);
    // Re-evaluate the third pick after the first two, ensuring three distinct actual buildings.
    if(selected.size<3){const candidate=[...sorted].sort((a,b)=>b.width*b.depth-a.width*a.depth).find(b=>!selected.has(b.id));if(candidate)selected.add(candidate.id);}
    return {schema:1,total:buildings.length,covered:buildings.filter(b=>b.cells>0).length,buildings,requiredExemplars:exemplars,selected:[...selected].slice(0,3),blocking:[...required.filter(k=>!exemplars[k]).map(k=>({subsystem:'city authoring',reason:`missing genuine ${k} archetype`})),...(buildings.some(b=>!b.physicalFixedJoints)?[{subsystem:'city structural physics',reason:'generated city uses support graph, not the required Rapier fixed-joint lifecycle'}]:[])]};
}
export function assessCityDemolition(coverage,runs){
    const failures=[...coverage.blocking];
    if(!coverage.total||coverage.covered!==coverage.total)failures.push({subsystem:'coverage',reason:`${coverage.covered}/${coverage.total} buildings have structural graphs`});
    if(runs.length!==3||new Set(runs.map(r=>r.id)).size!==3)failures.push({subsystem:'verification',reason:'three distinct actual city demolitions required'});
    for(const r of runs){
        if(!coverage.buildings.some(b=>b.id===r.id))failures.push({subsystem:'verification',id:r.id,reason:'demo fixture is not a city building'});
        for(const [field,subsystem]of [['collapseComplete','connectivity'],['settled','debris'],['reloadMatch','persistence'],['aiPathingUpdated','AI navigation'],['physicalJoints','joint physics'],['screenshotsReviewed','visual proof']])if(r[field]!==true)failures.push({subsystem,id:r.id,reason:`${field} not proved`});
        if(!r.presented||!Number.isFinite(r.frameP95)||!Number.isFinite(r.frameP99)||r.frameP95>16.67||r.frameP99>18.5)failures.push({subsystem:'frame pacing',id:r.id,reason:'60fps presentation budget not proved'});
        if(!Number.isFinite(r.peakBodies)||r.peakBodies>r.bodyCap)failures.push({subsystem:'debris budget',id:r.id,reason:'body cap missing or exceeded'});
    }return {pass:failures.length===0,failures};
}
