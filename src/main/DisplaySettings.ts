import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export interface DisplaySettings {resolution:string;fullscreen:boolean;vsync:boolean}
export function validateDisplay(value:unknown):DisplaySettings {
    if(!value||typeof value!=='object')throw new Error('Invalid display settings');
    const v=value as Partial<DisplaySettings>;if(!['1024x640','1280x720','1600x900','1920x1080'].includes(v.resolution||'')||typeof v.fullscreen!=='boolean'||typeof v.vsync!=='boolean')throw new Error('Invalid display values');
    return {resolution:v.resolution!,fullscreen:v.fullscreen,vsync:v.vsync};
}
export function readDisplay(file:string):DisplaySettings {try{return validateDisplay(JSON.parse(readFileSync(file,'utf8')));}catch{return {resolution:'1600x900',fullscreen:false,vsync:true};}}
export function writeDisplay(file:string,settings:DisplaySettings):void {mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(validateDisplay(settings)),'utf8');}
