import {globalEventBus} from '../core/EventBus.js';
/** Classify the actual ground contact where possible, otherwise local terrain. */
export function footSurface(object,world,p){
 const m=Array.isArray(object?.material)?object.material[0]:object?.material;const type=String((object?.userData?.surface||object?.userData?.type||'')+' '+(m?.userData?.proceduralKind||world?._procKindByImage?.get(m?.map?.image)||'')).toLowerCase();
 if(/water|puddle/.test(type))return 'water';if(/wood/.test(type))return 'wood';if(/metal/.test(type)||(m?.metalness||0)>.35)return 'metal';if(/asphalt|concrete|brick|floor|slab|building|ground/.test(type))return 'concrete';
 if(world?.city){const c=world.city,span=c.blockSize+c.roadWidth;const x=p.x+c.blocksX*span/2,z=p.z+c.blocksZ*span/2;if(x>=0&&z>=0&&x<c.blocksX*span&&z<c.blocksZ*span)return 'concrete';}return 'gravel';
}
export class GameFeel{
 constructor(game){this.game=game;this.lastX=NaN;this.lastZ=0;this.stride=0;this.lastUI=0;this.off=globalEventBus.on('combat:confirmed-hit',e=>{if(game.gameState==='playing'&&!game.isLoading)game.audioManager?.playSound('hit_flesh',{position:e.position,volume:.18});});this.click=e=>{const b=e.target.closest?.('button,.dialogue-option');if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return;const now=performance.now();if(now-this.lastUI<70)return;this.lastUI=now;game.audioManager?.playSound('ui_click',{volume:.14});};document.addEventListener('click',this.click);}
 update(dt){const p=this.game.player;if(!p)return;const x=p.position.x,z=p.position.z;if(!Number.isFinite(this.lastX)){this.lastX=x;this.lastZ=z;return;}const d=Math.hypot(x-this.lastX,z-this.lastZ);this.lastX=x;this.lastZ=z;if(!p.isGrounded||p.noclip||d>Math.max(2,dt*15)||d<.001){this.stride=0;return;}this.stride+=d;const length=p.isSprinting?1.8:p.isCrouching?.9:1.4;if(this.stride>=length){this.stride%=length;this.game.audioManager?.playSound('step_'+footSurface(p.groundSurfaceObject,this.game.worldManager,p.position),{volume:p.isCrouching?.16:p.isSprinting?.45:.3,pitchVariation:.16});}}
 dispose(){this.off();document.removeEventListener('click',this.click);}
}
