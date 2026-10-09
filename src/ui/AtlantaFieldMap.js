/** An inspectable regional field map, with no world-space quest markers. */
export function drawAtlantaFieldMap(canvas, geography, player) {
    const ctx=canvas.getContext('2d');if(!ctx||!geography)return;
    const width=canvas.width,height=canvas.height,pad=32;
    const scale=Math.min((width-pad*2)/geography.width,(height-pad*2)/geography.depth);
    const map=(x,z)=>[width/2+x*scale,height/2+z*scale];
    ctx.fillStyle='#c6bca3';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.beginPath();ctx.rect(pad,pad,width-pad*2,height-pad*2);ctx.clip();
    const labels=[];
    for(const district of geography.districts) {
        ctx.beginPath();
        for(const ring of district.rings)ring.forEach(([x,z],i)=>{const p=map(x,z);i?ctx.lineTo(...p):ctx.moveTo(...p);});
        ctx.fillStyle=district.name==='Downtown'||district.name==='Midtown'?'#9f9785':'#b6af98';
        ctx.fill('evenodd');ctx.strokeStyle='#706f5b';ctx.lineWidth=1;ctx.stroke();
        const ring=district.rings[0];
        if(!ring?.length)continue;
        const x=ring.reduce((s,p)=>s+p[0],0)/ring.length,z=ring.reduce((s,p)=>s+p[1],0)/ring.length;
        const p=map(x,z);if(p[0]<pad||p[0]>width-pad||p[1]<pad||p[1]>height-pad)continue;
        labels.push({name:district.name,p});
    }
    ctx.fillStyle='#313b32';ctx.textAlign='center';ctx.font='11px Georgia';
    for(const label of labels)ctx.fillText(label.name,...label.p);
    if(player) {
        const p=map(player.x,player.z);ctx.fillStyle='#794536';ctx.beginPath();ctx.arc(...p,4,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();ctx.strokeStyle='#555c4b';ctx.strokeRect(pad,pad,width-pad*2,height-pad*2);
    ctx.fillStyle='#313b32';ctx.textAlign='left';ctx.font='bold 14px Georgia';ctx.fillText('ATLANTA · FIELD SURVEY',pad,21);
    ctx.textAlign='right';ctx.fillText('N ↑',width-pad,21);
    ctx.textAlign='left';ctx.font='11px sans-serif';ctx.fillText('Recovered district survey · verify routes on foot',pad,height-12);
}
