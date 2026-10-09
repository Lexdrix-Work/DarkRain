/** Two-second samples; a slow recovery avoids repeatedly spending all headroom. */
export function resolutionStep(scale,target,frameMs,submissionMs,goodStreak=0){
    const ceiling=Math.max(.5,Math.min(1,target));scale=Math.min(scale,ceiling);
    if(frameMs>17.5&&scale>.5)return {scale:Math.max(.5,scale-(frameMs>25?.1:.05)),goodStreak:0};
    if(frameMs<=16.8&&submissionMs<12.5&&scale<ceiling){goodStreak++;if(goodStreak>=10)return {scale:Math.min(ceiling,scale+.025),goodStreak:0};return {scale,goodStreak};}
    return {scale,goodStreak:0};
}
