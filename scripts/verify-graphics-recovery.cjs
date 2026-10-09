const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../work/graphics-recovery');fs.mkdirSync(dir,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function target(){const list=await (await fetch('http://127.0.0.1:9439/json/list')).json();return list.find(t=>t.type==='page'&&t.url.includes('renderer/index.html'));}
async function connect(t){const socket=new WebSocket(t.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let sequence=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const callback=pending.get(m.id);pending.delete(m.id);callback(m);}};return {socket,async evaluate(expression){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,m=>m.error||m.result?.exceptionDetails?reject(Error(JSON.stringify(m.error||m.result.exceptionDetails))):resolve(m.result.result.value));socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));});}};}
(async()=>{let before,client;for(let i=0;i<300;i++){try{before=await target();client=await connect(before);if(await client.evaluate('!!window.__drBooted&&!!window.game?.uiManager'))break;client.socket.close();}catch{}await wait(100);}if(!client)throw Error('No test application');
const original=await client.evaluate('window.game.renderer.backendName');await client.evaluate('void window.game.recoverGraphics()');client.socket.close();
let after,backend;for(let i=0;i<600;i++){try{after=await target();if(after.id===before.id){await wait(100);continue;}client=await connect(after);backend=await client.evaluate('window.__drBooted&&window.game?.renderer?.backendName');if(backend==='WebGL2')break;client.socket.close();}catch{}await wait(100);}
if(backend!=='WebGL2'||!after.url.includes('backend=webgl'))throw Error('Fresh fallback process did not initialize');
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({original,backend,freshRenderer:after.id!==before.id,menu:await client.evaluate('window.game.gameState'),createdAt:new Date().toISOString()},null,2));
await client.evaluate('window.close();void 0').catch(()=>{});client.socket.close();console.log('RECOVERY PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
