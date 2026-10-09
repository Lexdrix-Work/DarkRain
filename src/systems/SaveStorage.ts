import type { DesktopBridge } from '../shared/DesktopContracts';

/** Cached index keeps menu checks synchronous; successful writes await durable IPC. */
export class SaveStorage {
    private readonly cache=new Map<string,string>();
    private readonly prefix:string;private readonly desktop:DesktopBridge|undefined;
    constructor(prefix:string,desktop?:DesktopBridge){this.prefix=prefix;this.desktop=desktop;}
    async initialize():Promise<void>{
        if(this.desktop?.saves){
            this.cache.clear();for(const record of await this.desktop.saves.list())this.cache.set(this.prefix+record.slot,record.json);
        }
        for(let i=0;i<localStorage.length;i++){
            const key=localStorage.key(i);if(!key?.startsWith(this.prefix)||this.cache.has(key))continue;
            const json=localStorage.getItem(key);if(!json)continue;
            try{await this.setItem(key,json);if(this.desktop?.saves){localStorage.removeItem(key);i--;}}catch(error){console.warn('Legacy save import failed',error);}
        }
    }
    getItem(key:string):string|null{return this.cache.get(key)??(this.desktop?.saves?null:localStorage.getItem(key));}
    async markEnded(id:string):Promise<void>{if(this.desktop?.saves.markEnded)await this.desktop.saves.markEnded(id);else{const ids=JSON.parse(localStorage.getItem('darkrain_ended_campaigns')||'[]');if(!ids.includes(id))ids.push(id);localStorage.setItem('darkrain_ended_campaigns',JSON.stringify(ids));}for(const [key,json]of this.cache){const d=JSON.parse(json);if(d.meta?.campaignId===id){d.meta.ended=true;this.cache.set(key,JSON.stringify(d));}}}
    isEnded(id:string):boolean{return JSON.parse(localStorage.getItem('darkrain_ended_campaigns')||'[]').includes(id);}
    async readItem(key:string):Promise<string|null>{
        if(this.desktop?.saves.read){if(!key.startsWith(this.prefix))throw new Error('Invalid save key');return this.desktop.saves.read(key.slice(this.prefix.length));}
        return this.getItem(key);
    }
    get cachedBytes():number{let bytes=0;for(const json of this.cache.values())bytes+=json.length*2;return bytes;}
    async setItem(key:string,json:string):Promise<void>{
        if(!key.startsWith(this.prefix))throw new Error('Invalid save key');
        if(this.desktop?.saves)await this.desktop.saves.write(key.slice(this.prefix.length),json);
        else localStorage.setItem(key,json);
        if(this.desktop?.saves.read){const data=JSON.parse(json);this.cache.set(key,JSON.stringify({meta:data.meta,currentLevel:data.currentLevel}));}else this.cache.set(key,json);
    }
    async removeItem(key:string):Promise<void>{
        if(this.desktop?.saves)await this.desktop.saves.remove(key.slice(this.prefix.length));
        localStorage.removeItem(key);this.cache.delete(key);
    }
    keys():string[]{return [...this.cache.keys()];}
}
