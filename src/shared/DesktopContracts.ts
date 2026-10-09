export interface SaveRecord { slot: string; json: string }
export interface DisplayState {width:number;height:number;fullscreen:boolean;activeVsync:boolean;restartRequired:boolean}
export interface DesktopBridge {
    readonly isDesktop: true;
    readonly perf: boolean;
    display?: {get():Promise<DisplayState>;configure(settings:{resolution:string;fullscreen:boolean;vsync:boolean}):Promise<DisplayState>;restart(resume:boolean):Promise<void>};
    memory?: { sample(): Promise<Array<{type:string;privateBytes:number|null;workingSetBytes:number}>> };
    graphics?: { restartFallback(resume: boolean): Promise<void> };
    capture?: {write(png:Uint8Array):Promise<string>};
    saves: {
        list(): Promise<SaveRecord[]>;
        markEnded?(campaignId:string):Promise<void>;
        read?(slot:string):Promise<string|null>;
        write(slot: string, json: string): Promise<void>;
        remove(slot: string): Promise<void>;
    };
}
declare global { interface Window { darkRainDesktop?: DesktopBridge } }
