import type { StructuralGraph } from './StructuralGraph.ts';

/** Rebuild after deletions: ordinary union-find cannot undo an earlier union. */
export function structuralIslands(graph:{nodes:readonly {index:number}[];edges:readonly {index:number;nodeA:number;nodeB:number}[]},alive:Uint8Array,active:Uint8Array,ground:ReadonlySet<number>){
    const parent=Int32Array.from(graph.nodes,n=>n.index),size=new Uint32Array(parent.length).fill(1);
    const find=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]!]!;i=parent[i]!;}return i;};
    for(const edge of graph.edges)if(active[edge.index]&&alive[edge.nodeA]&&alive[edge.nodeB]){
        let a=find(edge.nodeA),b=find(edge.nodeB);if(a===b)continue;if(size[a]!<size[b]!)[a,b]=[b,a];parent[b]=a;size[a]=size[a]!+size[b]!;
    }
    const grounded=new Set<number>();for(const i of ground)if(alive[i])grounded.add(find(i));
    const groups=new Map<number,number[]>();for(let i=0;i<parent.length;i++)if(alive[i]){const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root)!.push(i);}
    return [...groups].map(([root,members])=>({root,members,grounded:grounded.has(root)}));
}

export const JOINT_PROFILES={
    'wood-nailed-wood':{peakN:1200,shearN:900,impulseNs:18,energyJ:35},
    'wood-bolted-wood':{peakN:12000,shearN:8000,impulseNs:90,energyJ:250},
    'steel-bolted-concrete':{peakN:40000,shearN:25000,impulseNs:250,energyJ:900},
    'steel-welded-steel':{peakN:150000,shearN:90000,impulseNs:600,energyJ:4000},
    'concrete-embedded-concrete':{peakN:180000,shearN:90000,impulseNs:650,energyJ:2200},
    'brick-mortar-brick':{peakN:1500,shearN:1000,impulseNs:20,energyJ:25},
    'glass-framed-steel':{peakN:400,shearN:300,impulseNs:5,energyJ:8},
    'drywall-screwed-wood':{peakN:250,shearN:180,impulseNs:4,energyJ:5},
} as const;
/** Force, impulse and energy are separate limits. Below-limit gravity never accumulates indefinitely. */
export function accumulatedJointDamage(prior:number,event:{peakN:number;impulseNs:number;energyJ:number},limit:{peakN:number;impulseNs:number;energyJ:number}){
    const ratio=Math.max(event.peakN/limit.peakN,event.impulseNs/limit.impulseNs,event.energyJ/limit.energyJ);
    return Math.min(1,prior+Math.max(0,ratio-.35)**2*.25);
}
