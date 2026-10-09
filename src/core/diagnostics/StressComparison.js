/** Qualification gate: failed/partial profiles must never become claimed wins. */
export function compareStressProfile(report){
 if(report?.status!=='measured')return {qualified:false,reason:report?.rendererFailure?.reason||report?.error||report?.status||'No measured baseline',wins:[]};
 const cases=report.data?.cases||[],base=cases.find(c=>c.scale===1);
 const valid=c=>c&&c.frames>=120&&c.airborneBodies>0&&c.failedJoints>0&&c.anomalies>0&&c.maxDrawCalls>0&&Number.isFinite(c.total?.mean)&&Number.isFinite(c.total?.p95)&&Number.isFinite(c.total?.p99);
 if(!valid(base)||cases.some(c=>!valid(c)))return {qualified:false,reason:'Incomplete collapse/emission workload',wins:[]};
 const wins=cases.filter(c=>c!==base).map(c=>({scale:c.scale,meanSavedMs:base.total.mean-c.total.mean,p95SavedMs:base.total.p95-c.total.p95,p99SavedMs:base.total.p99-c.total.p99})).filter(w=>w.meanSavedMs>=1&&w.p95SavedMs>=1&&w.p99SavedMs>=0);
 return {qualified:true,scope:'Serial full-game workload; presentation pacing requires a separate live run',baseline:base.total,wins};
}
