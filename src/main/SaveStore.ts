import {mkdir,readFile,writeFile,rename,readdir,unlink,open,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {validSaveData} from '../shared/SaveSchema.js';
import type {SaveRecord} from '../shared/DesktopContracts';
export function validSlot(slot:unknown):asserts slot is string{if(typeof slot!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(slot))throw Error('Invalid save slot');}
export function validateSave(json:unknown):asserts json is string{if(typeof json!=='string'||Buffer.byteLength(json)>64*1024*1024||!validSaveData(JSON.parse(json)))throw Error('Invalid save data');}
async function readBounded(file:string){if((await stat(file)).size>128*1024*1024+4096)throw Error('Save envelope too large');return readFile(file,'utf8');}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function encode(json:string){return JSON.stringify({format:'Dark Rain.save/2',checksum:hash(json),payload:json});}
function decode(text:string){const e=JSON.parse(text);if(e.format==='Dark Rain.save/2'){if(typeof e.payload!=='string'||hash(e.payload)!==e.checksum)throw Error('Save checksum mismatch');validateSave(e.payload);return e.payload;}validateSave(text);return text;}
async function atomic(file:string,text:string){const temp=file+'.tmp';await writeFile(temp,text,'utf8');const h=await open(temp,'r+');try{await h.sync();}finally{await h.close();}await rename(temp,file);}
/** Serialized, checksummed snapshots. A corrupt primary never replaces a good backup. */
export class SaveStore{
 private queue:Promise<void>=Promise.resolve();private readonly directory:string;
 constructor(directory:string){this.directory=directory;}
 private async deaths():Promise<string[]>{let names:string[]=[];try{names=await readdir(this.directory);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const marked=names.flatMap(n=>{const m=/^campaign-([a-zA-Z0-9_-]{1,80})\.ended$/.exec(n);return m?[m[1]!]:[];});try{const old=JSON.parse(await readBounded(join(this.directory,'campaigns-ended.json')));if(!Array.isArray(old)||old.some(x=>typeof x!=='string'))throw Error('Invalid legacy campaign ledger');return [...new Set([...marked,...old])];}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return marked;throw e;}}
 private async ended(json:string){const d=JSON.parse(json);return !!d.meta?.campaignId&&(await this.deaths()).includes(d.meta.campaignId);}
 markEnded(id:string):Promise<void>{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Error('Invalid campaign');const op=this.queue.catch(()=>{}).then(async()=>{await mkdir(this.directory,{recursive:true});await atomic(join(this.directory,'campaign-'+id+'.ended'),JSON.stringify({campaignId:id,endedAt:Date.now()}));});this.queue=op;return op;}
 write(slot:string,json:string):Promise<void>{validSlot(slot);validateSave(json);const op=this.queue.catch(()=>{}).then(async()=>{await mkdir(this.directory,{recursive:true});if(await this.ended(json))throw Error('Campaign ended');const file=join(this.directory,slot+'.json');let previous:string|null=null;try{const text=await readBounded(file);decode(text);previous=text;}catch(e){if((e as NodeJS.ErrnoException).code&& (e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}if(previous)await atomic(file+'.bak',previous);await atomic(file,encode(json));});this.queue=op;return op;}
 async list(metadataOnly=false):Promise<SaveRecord[]>{await this.queue.catch(()=>{});await mkdir(this.directory,{recursive:true});const names=await readdir(this.directory),slots=new Set(names.filter(n=>/^[a-zA-Z0-9_-]{1,48}\.json(?:\.bak)?$/.test(n)).map(n=>n.split('.')[0]!));const records:SaveRecord[]=[];for(const slot of slots){for(const suffix of ['.json','.json.bak']){try{const json=decode(await readBounded(join(this.directory,slot+suffix))),d=JSON.parse(json);if(metadataOnly){d.meta.ended=await this.ended(json);d.meta.recovered=suffix.endsWith('.bak');}records.push({slot,json:metadataOnly?JSON.stringify({meta:d.meta,currentLevel:d.currentLevel}):json});break;}catch{/* previous durable generation */}}}return records;}
 async read(slot:string):Promise<string|null>{validSlot(slot);await this.queue.catch(()=>{});for(const suffix of ['.json','.json.bak']){try{const json=decode(await readBounded(join(this.directory,slot+suffix)));if(await this.ended(json))return null;return json;}catch{/* previous durable generation */}}return null;}
 remove(slot:string):Promise<void>{validSlot(slot);const op=this.queue.catch(()=>{}).then(async()=>{for(const suffix of ['.json','.json.bak','.json.tmp','.json.bak.tmp'])try{await unlink(join(this.directory,slot+suffix));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}});this.queue=op;return op;}
}
