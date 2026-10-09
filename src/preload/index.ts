import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../shared/DesktopContracts';
const bridge: DesktopBridge={capture:{write:png=>ipcRenderer.invoke('darkrain:capture',png)},isDesktop:true,display:{get:()=>ipcRenderer.invoke('darkrain:display:get'),configure:settings=>ipcRenderer.invoke('darkrain:display:configure',settings),restart:resume=>ipcRenderer.invoke('darkrain:display:restart',resume)},perf:process.argv.includes('--perf'),memory:{sample:()=>ipcRenderer.invoke('darkrain:memory:sample')},graphics:{restartFallback:resume=>ipcRenderer.invoke('darkrain:graphics:fallback',resume)},saves:{
    list:()=>ipcRenderer.invoke('darkrain:saves:list'),markEnded:id=>ipcRenderer.invoke('darkrain:saves:ended',id),
    read:slot=>ipcRenderer.invoke('darkrain:saves:read',slot),
    write:(slot,json)=>ipcRenderer.invoke('darkrain:saves:write',slot,json),
    remove:slot=>ipcRenderer.invoke('darkrain:saves:remove',slot)
}};
contextBridge.exposeInMainWorld('darkRainDesktop',bridge);
