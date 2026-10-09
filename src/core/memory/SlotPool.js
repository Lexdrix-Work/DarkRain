/** Fixed capacity with generation counters: stale handles cannot release a reused slot. */
export class SlotPool {
    constructor(capacity){if(!Number.isInteger(capacity)||capacity<1)throw Error('Invalid pool capacity');this.capacity=capacity;this.free=new Uint32Array(capacity);this.generations=new Uint32Array(capacity);this.used=new Uint8Array(capacity);this.available=capacity;this.active=0;this.highWater=0;for(let i=0;i<capacity;i++)this.free[i]=capacity-1-i;}
    acquire(){if(!this.available)return -1;const slot=this.free[--this.available];this.used[slot]=1;this.active++;this.highWater=Math.max(this.highWater,this.active);return slot;}
    generation(slot){return this.generations[slot];}
    release(slot,generation){if(slot<0||slot>=this.capacity||!this.used[slot]||generation!==this.generations[slot])return false;this.used[slot]=0;this.generations[slot]++;this.free[this.available++]=slot;this.active--;return true;}
}
