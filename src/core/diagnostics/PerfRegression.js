export const REGRESSION_BUDGETS=Object.freeze({
    software:{avg:100,p95:150,p99:300,maxDrawCalls:32,maxGeometries:16,maxTextures:8},
    hardware:{avg:16.67,p95:20,p99:33.4,maxDrawCalls:32,maxGeometries:16,maxTextures:8}
});
export function assessRegression(scenes,tier='software'){
    const budget=REGRESSION_BUDGETS[tier];if(!budget)throw new Error('Unknown regression tier');const failures=[];
    for(const name of ['courtyard','debris','chunk-churn'])if(!scenes.some(s=>s.name===name))failures.push(name+': missing scene');
    for(const scene of scenes){
        if(!Number.isFinite(scene.samples)||scene.samples<120)failures.push(scene.name+': insufficient samples');
        for(const key of ['avg','p95','p99','maxDrawCalls','maxGeometries','maxTextures'])if(!Number.isFinite(scene[key])||scene[key]<0||scene[key]>budget[key])failures.push(scene.name+': '+key+' exceeds '+budget[key]);
        if(!scene.nonBlank||scene.minDrawCalls<1||scene.minTriangles<1)failures.push(scene.name+': missing rendered output');
        if(scene.remainingGeometries>0)failures.push(scene.name+': geometry leaked after teardown');
        if(scene.name==='debris'&&scene.activeBodies!==128)failures.push('debris: physics workload missing');
    }
    return {pass:failures.length===0,tier,budget,failures};
}
