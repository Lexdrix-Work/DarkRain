export interface TerrainConfig { terrainAmplitude?:number;terrainFlatRadius?:number;architecture?:string }
export interface TerrainJob { positions:Float32Array; permutation:Uint8Array; config:TerrainConfig; spacing:number }
export function terrainSampler(permutation:Uint8Array,config:TerrainConfig){
    const noise=(x:number,z:number):number=>{
        const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf),X=xi&255,Z=zi&255;
        const a=permutation[(permutation[X]!+Z)&255]!/255,b=permutation[(permutation[(X+1)&255]!+Z)&255]!/255;
        const c=permutation[(permutation[X]!+Z+1)&255]!/255,d=permutation[(permutation[(X+1)&255]!+Z+1)&255]!/255;
        return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
    };
    const fbm=(x:number,z:number,octaves:number):number=>{let sum=0,amp=.5,freq=1,norm=0;for(let i=0;i<octaves;i++){sum+=amp*noise(x*freq,z*freq);norm+=amp;amp*=.5;freq*=2.03;}return sum/norm;};
    const height=(x:number,z:number):number=>{
        const hills=(fbm(x*.012+31.7,z*.012-11.3,4)-.5)*2*(config.terrainAmplitude??7);
        const undulation=(fbm(x*.06-5.1,z*.06+17.9,2)-.5)*2*1.2;
        const m=Math.min(1,Math.max(0,(Math.hypot(x,z)-(config.terrainFlatRadius??90))/130)),eased=m*m*(3-2*m);
        return hills*eased+undulation*(config.architecture==='atlanta'?.2*eased:.2+.8*eased);
    };return{height,fbm};
}
function linear(channel:number):number{return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;}
function rgb(hex:number):number[]{return [linear(((hex>>16)&255)/255),linear(((hex>>8)&255)/255),linear((hex&255)/255)];}
export function generateTerrain(job:TerrainJob){
    const {height,fbm}=terrainSampler(job.permutation,job.config),positions=job.positions,colors=new Float32Array(positions.length),normals=new Float32Array(positions.length);
    const dirt=rgb(0x4a4238),grass=rgb(0x5c5a38),concrete=rgb(0x5a574e),scorch=rgb(0x2b2723);
    for(let i=0;i<positions.length;i+=3){
        const x=positions[i]!,z=positions[i+2]!,h=height(x,z);positions[i+1]=h;
        const n=fbm(x*.03+91.2,z*.03-47.8,3),g=Math.min(1,Math.max(0,(h+1.5)/9))*.75;
        for(let j=0;j<3;j++){let c=dirt[j]!+(grass[j]!-dirt[j]!)*g;if(n>.60)c+=(concrete[j]!-c)*.55;else if(n<.32)c+=(scorch[j]!-c)*.6;colors[i+j]=c;}
        const step=job.spacing,dx=(height(x+step,z)-height(x-step,z))/(2*step),dz=(height(x,z+step)-height(x,z-step))/(2*step),length=Math.hypot(dx,1,dz);
        normals[i]=-dx/length;normals[i+1]=1/length;normals[i+2]=-dz/length;
    }return{positions,colors,normals};
}
