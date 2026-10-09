const comparePriority=(a,b)=>((a.d<=219?-1000:0)+a.ahead)-((b.d<=219?-1000:0)+b.ahead);
/** Finite manifest residency scheduler. Assets are prepared asynchronously before admission. */
export class ChunkResidency {
    constructor(recipes,{commit,release,pinned=()=>false,now=()=>performance.now(),budget=.4,maxResident=48}={}){
        this.recipes=recipes;this.entries=recipes.map(r=>({r,d:0,ahead:0}));this.commit=commit;this.release=release;this.pinned=pinned;this.now=now;this.budget=budget;this.maxResident=maxResident;
        this.resident=new Map();this.lastPlan=-Infinity;this.plan=[];this.overruns=0;this.lastMs=0;this.maxMs=0;this.pending=0;this.disposed=false;
    }
    update(position,velocity={x:0,z:0},force=false){
        if(this.disposed)return;
        const start=this.now();
        if(force||start-this.lastPlan>=250){
            this.lastPlan=start;const speed=Math.hypot(velocity.x,velocity.z),lead=Math.min(128,speed*3),nx=speed?velocity.x/speed:0,nz=speed?velocity.z/speed:0;
            const fx=position.x+nx*lead,fz=position.z+nz*lead;this.plan.length=0;
            for(let i=0;i<this.entries.length;i++){const e=this.entries[i];e.d=Math.hypot(e.r.x-position.x,e.r.z-position.z);e.ahead=Math.hypot(e.r.x-fx,e.r.z-fz);if(this.memoryConstrained?e.d<=219:e.d<=347||e.ahead<=411)this.plan.push(e);}this.plan.sort(comparePriority);        }
        // One transaction maximum: milliseconds cannot preempt a geometry upload.
        let changed=false;
        for(const [id,value]of this.resident){const recipe=value.recipe;if(Math.hypot(recipe.x-position.x,recipe.z-position.z)>(this.memoryConstrained?219:475)&&!this.pinned(id)){this.release(value.asset);this.resident.delete(id);changed=true;break;}}
        if(!changed&&this.now()-start<this.budget&&this.resident.size<this.maxResident){let next;for(let i=0;i<this.plan.length;i++){const p=this.plan[i];if(!this.resident.has(p.r.id)){next=p;break;}}if(next){const asset=this.commit(next.r);this.resident.set(next.r.id,{recipe:next.r,asset});}}
        this.pending=0;for(let i=0;i<this.plan.length;i++)if(!this.resident.has(this.plan[i].r.id))this.pending++;this.lastMs=this.now()-start;this.maxMs=Math.max(this.maxMs,this.lastMs);if(this.lastMs>this.budget)this.overruns++;
    }
    stats(){return {resident:this.resident.size,pending:this.pending,commitMs:this.lastMs,maxCommitMs:this.maxMs,overruns:this.overruns,budgetMs:this.budget};}
    dispose(){if(this.disposed)return;this.disposed=true;for(const r of this.resident.values())this.release(r.asset);this.resident.clear();this.plan=[];}
}
