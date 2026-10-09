/** Capacity limits concurrency, never how much of a building can be destroyed or retained. */
export function cityBodyBudget(quality){return quality==='ultra'?{primary:144,total:256,chips:64}:{primary:48,total:96,chips:32};}
export function cityBodyCounts(physics){let structural=0,chips=0;for(const r of physics.dynamic.values()){if(r.kind==='structural')structural++;else if(r.kind==='wall-chip')chips++;}return {structural,chips,total:structural+chips};}
