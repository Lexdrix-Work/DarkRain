export class StartupTrace {
    constructor(now=()=>performance.now()){this.now=now;this.started=now();this.phases={};this.menuMs=null;this.playableMs=null;this.sessionStart=null;this.entryMs=null;}
    async measure(name,work){const start=this.now();try{return await work();}finally{this.phases[name]=this.now()-start;}}
    menuReady(){this.menuMs=this.now()-this.started;}
    startSession(){this.sessionStart=this.now();}
    playable(){this.playableMs=this.now()-this.started;this.entryMs=this.sessionStart===null?null:this.now()-this.sessionStart;}
    snapshot(){return {rendererToMenuMs:this.menuMs,rendererToPlayableMs:this.playableMs,entryToPlayableMs:this.entryMs,phases:{...this.phases}};}
}
