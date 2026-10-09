import {readDisplay,writeDisplay,validateDisplay} from './DisplaySettings';
import { app, BrowserWindow, ipcMain, shell, screen } from 'electron';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SaveStore } from './SaveStore';
import {writeFile,mkdir} from 'node:fs/promises';
import { mkdirSync } from 'node:fs';

const location=dirname(fileURLToPath(import.meta.url));
const perf=process.argv.includes('--perf');
app.setName('Dark Rain');
const profile=app.commandLine.getSwitchValue('user-data-dir');
if(profile){mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
const displayFile=join(app.getPath('userData'),'display-settings.json');let displaySettings=readDisplay(displayFile);const activeVsync=displaySettings.vsync;if(!activeVsync)app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
let window: BrowserWindow | null=null;
function trusted(event: Electron.IpcMainInvokeEvent): void {
    if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame)throw new Error('Untrusted save request');
    const expected=process.env.ELECTRON_RENDERER_URL;
    const actual=event.senderFrame.url;
    if(expected ? new URL(actual).origin!==new URL(expected).origin : actual.split('?')[0]!==pathToFileURL(join(location,'../renderer/index.html')).href)throw new Error('Invalid save origin');
}
function displayState(){const [width,height]=window!.getContentSize();return {width,height,fullscreen:window!.isFullScreen(),activeVsync,restartRequired:displaySettings.vsync!==activeVsync};}
function applyDisplay(){if(!window)return;window.setFullScreen(displaySettings.fullscreen);if(!displaySettings.fullscreen){const [width,height]=displaySettings.resolution.split('x').map(Number) as [number,number],area=screen.getDisplayMatching(window.getBounds()).workAreaSize;window.setContentSize(Math.max(1024,Math.min(width,area.width-20)),Math.max(640,Math.min(height,area.height-48)));}}
function createWindow():void {
    window=new BrowserWindow({width:1600,height:900,minWidth:1024,minHeight:640,title:'Dark Rain',backgroundColor:'#0a0a0a',autoHideMenuBar:true,
        webPreferences:{preload:join(location,'../preload/index.cjs'),autoplayPolicy:'no-user-gesture-required',contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,additionalArguments:perf?['--perf']:[]}});
    applyDisplay();
    window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))void shell.openExternal(url);return{action:'deny'};});
    const query:Record<string,string>={};if(process.argv.includes('--darkrain-webgl'))query.backend='webgl';if(process.argv.includes('--darkrain-resume'))query.resume='renderer_recovery';if(process.argv.includes('--darkrain-settings-resume'))query.resume='settings_restart';
    if(process.env.ELECTRON_RENDERER_URL){const url=new URL(process.env.ELECTRON_RENDERER_URL);for(const [key,value]of Object.entries(query))url.searchParams.set(key,value);void window.loadURL(url.href);}
    else void window.loadFile(join(location,'../renderer/index.html'),{query});
    window.webContents.on('render-process-gone',(_event,details)=>{
        if(details.reason!=='oom')return;
        if(process.argv.includes('--darkrain-memory-recovered'))return;
        // The renderer cannot save once killed. Reopen the menu using durable saves.
        app.relaunch({args:process.argv.slice(1).filter(arg=>arg!=='--darkrain-resume').concat(['--darkrain-webgl','--darkrain-memory-recovered'])});setImmediate(()=>app.quit());
    });
    window.on('closed',()=>{window=null;});
}
void app.whenReady().then(()=>{
    ipcMain.handle('darkrain:capture',async(event,png:unknown)=>{trusted(event);if(!(png instanceof Uint8Array)||png.byteLength>32*1024*1024||png.byteLength<24)throw Error('Invalid PNG');const bytes=Buffer.from(png);if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG signature');const folder=join(app.getPath('pictures'),'Dark Rain');await mkdir(folder,{recursive:true});const file=join(folder,'DarkRain-'+Date.now()+'-'+Math.random().toString(16).slice(2,8)+'.png');await writeFile(file,bytes,{flag:'wx'});return file;});
    const store=new SaveStore(join(app.getPath('userData'),'saves'));
    ipcMain.handle('darkrain:display:get',event=>{trusted(event);return displayState();});
    ipcMain.handle('darkrain:display:configure',(event,value:unknown)=>{trusted(event);displaySettings=validateDisplay(value);writeDisplay(displayFile,displaySettings);applyDisplay();return displayState();});
    ipcMain.handle('darkrain:display:restart',async(event,resume:unknown)=>{
        trusted(event);if(typeof resume!=='boolean')throw new Error('Invalid restart');if(resume&&!await store.read('settings_restart'))throw new Error('No durable restart save');
        const args=process.argv.slice(1).filter(arg=>!['--darkrain-settings-resume','--darkrain-resume','--disable-frame-rate-limit','--disable-gpu-vsync'].includes(arg));if(resume)args.push('--darkrain-settings-resume');app.relaunch({args});setImmediate(()=>app.quit());
    });
    ipcMain.handle('darkrain:saves:ended',(event,id:string)=>{trusted(event);return store.markEnded(id);});
    ipcMain.handle('darkrain:saves:list',event=>{trusted(event);return store.list(true);});
    ipcMain.handle('darkrain:saves:read',(event,slot:string)=>{trusted(event);return store.read(slot);});
    ipcMain.handle('darkrain:memory:sample',event=>{trusted(event);return app.getAppMetrics().map(metric=>({type:metric.type,privateBytes:metric.memory.privateBytes===undefined?null:metric.memory.privateBytes*1024,workingSetBytes:metric.memory.workingSetSize*1024}));});
    ipcMain.handle('darkrain:saves:write',(event,slot:string,json:string)=>{trusted(event);return store.write(slot,json);});
    ipcMain.handle('darkrain:saves:remove',(event,slot:string)=>{trusted(event);return store.remove(slot);});
    ipcMain.handle('darkrain:graphics:fallback',async(event,resume:unknown)=>{
        trusted(event);if(typeof resume!=='boolean')throw new Error('Invalid recovery request');
        if(process.argv.includes('--darkrain-webgl'))throw new Error('Fallback already selected');
        const args=process.argv.slice(1).filter(arg=>arg!=='--darkrain-resume');args.push('--darkrain-webgl');
        if(resume&&(await store.list(true)).some(record=>record.slot==='renderer_recovery'))args.push('--darkrain-resume');
        // A crashed GPU process can leave GL unavailable in the same Chromium
        // instance. A fresh application process clears those failed contexts.
        app.relaunch({args});setImmediate(()=>app.quit());
    });
    createWindow();app.on('activate',()=>{if(!window)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
