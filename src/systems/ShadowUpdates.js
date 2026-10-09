/** The node renderer reads LightShadow flags, not legacy renderer.shadowMap flags. */
export function flushShadowInvalidation(game){
    if(!game.renderer.shadowMap.enabled||!game.renderer.shadowMap.needsUpdate)return;
    for(const light of [game.dayNightCycle?.sunLight,game.dayNightCycle?.moonLight,game.flashlightSystem?.spotLight])if(light?.castShadow)light.shadow.needsUpdate=true;
    game.renderer.shadowMap.needsUpdate=false;
}
/** Moving bodies and actors must not wait for the static scene's refresh timer. */
export function updateShadowMaps(game,dt) {
    if(!game.renderer.shadowMap.enabled)return;
    let moving=false;const physics=game.physicsSystem;
    for(const r of physics?.dynamic?.values()||[])if(r.mesh?.castShadow&&!r.body.isSleeping()){moving=true;break;}
    if(!moving&&physics?.actors?.size)moving=true;
    if(!moving)for(const n of physics?.fixture?.nodes||[])if(n.alive&&n.loose&&!n.body.isSleeping()){moving=true;break;}
    // Celestial and flashlight transforms can move without player translation.
    for(const light of [game.dayNightCycle?.sunLight,game.dayNightCycle?.moonLight,game.flashlightSystem?.spotLight]){
        if(!light?.castShadow)continue;
        const p=light.position,t=light.target.position,a=light.userData.shadowPose||=[];
        if(a.length!==6||Math.abs(a[0]-p.x)+Math.abs(a[1]-p.y)+Math.abs(a[2]-p.z)+Math.abs(a[3]-t.x)+Math.abs(a[4]-t.y)+Math.abs(a[5]-t.z)>1e-6)moving=true;
        a[0]=p.x;a[1]=p.y;a[2]=p.z;a[3]=t.x;a[4]=t.y;a[5]=t.z;
    }
    if(moving){game.renderer.shadowMap.needsUpdate=true;game._shadowElapsed=0;return;}
    game._shadowElapsed=(game._shadowElapsed||0)+Math.max(0,dt);
    const interval=game.settings.quality==='medium'?1/20:1/30;
    if(game._shadowElapsed>=interval) {
        game._shadowElapsed%=interval;
        game.renderer.shadowMap.needsUpdate=true;
    }
}
