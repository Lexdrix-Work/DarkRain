/** Visual effects yield before simulation, fracture, or material persistence. */
export function fidelityLevel(quality:string,scale=1,frameMs=16.67,automatic=true){const levels:Record<string,number>={low:0,medium:1,high:2,ultra:3};const base=levels[quality]??1;if(!automatic)return 3;if(frameMs>18||scale<.7)return 0;if(frameMs>16.7||scale<.85)return Math.min(base,1);return base;}
export const FIDELITY_SHEDDING_ORDER=Object.freeze(['rolling shutter','lens dirt','screen-space AO','close surface relief','cosmetic contact density']);
/** One declared policy across both visual passes. Future effects are marked as
 * planned in the verification report, rather than presented as working controls. */
export const VISUAL_SHEDDING_ORDER=Object.freeze(['render resolution','rolling shutter','lens dirt','cosmetic particle emission density','screen-space AO','close surface relief','cosmetic contact density','far vegetation density','reflection update rate','bloom','shadow resolution']);

export const fidelityState={relief:1,contactLimit:24,fxDensity:1};
export class FidelityGovernor{
 level:number|undefined;recoverSince:number|undefined;
 update(quality:string,scale:number,ms:number,automatic:boolean,now:number){const wanted=fidelityLevel(quality,scale,ms,automatic);if(!automatic||this.level===undefined||wanted<this.level){this.level=wanted;this.recoverSince=undefined;}else if(wanted>this.level){if(this.recoverSince===undefined)this.recoverSince=now;if(now-this.recoverSince>=5000){this.level++;this.recoverSince=undefined;}}else this.recoverSince=undefined;return this.level;}
}

