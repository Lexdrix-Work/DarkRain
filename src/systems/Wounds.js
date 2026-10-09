export function addWound(entity,damage,source) {
    if(!source||damage<8||entity.godMode)return;
    const state=entity.stats||entity;
    state.bleeding=Math.min(3,(state.bleeding||0)+Math.min(1.5,damage/35));
    entity._woundSource=source;
}
export function updateWounds(entity,dt) {
    const state=entity.stats||entity;
    if(!state.bleeding||entity.godMode||state.health<=0)return;
    state.health=Math.max(0,state.health-state.bleeding*Math.max(0,dt));
    entity._bleedFX=(entity._bleedFX||0)+dt;
    if(entity._bleedFX>=2&&entity.game?.effectsSystem?.blood&&entity.position) {
        entity._bleedFX=0;const p=entity.position.clone();p.y=entity.game.worldManager.getTerrainHeight(p.x,p.z);
        entity.game.effectsSystem.blood.stain(p,{x:0,y:1,z:0,isVector3:true},.10);
    }
    if(state.health<=0)entity.die();
}
export function armorDamage(damage,armor) {
    return Math.max(0,damage)*(1-Math.min(.65,Math.max(0,armor)/100));
}
