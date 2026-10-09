import {cpSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Plugin} from 'vite';
/** Optional build mode: ship the installed, prebuilt Three modules locally instead
 * of reparsing their large bundles in Rollup. The renderer/API/version are unchanged. */
export function lowMemoryVendor():Plugin{
 return {name:'darkrain-local-three-vendor',apply:'build',
  transformIndexHtml:{order:'post',handler(html,context){const prefix=context.filename.replaceAll('\\','/').includes('/scripts/')?'../':'./';
   const imports={'three':prefix+'vendor/three/build/three.module.js','three/webgpu':prefix+'vendor/three/build/three.webgpu.js','three/tsl':prefix+'vendor/three/build/three.tsl.js','three/addons/':prefix+'vendor/three/examples/jsm/'};
   return {html,tags:[{tag:'script',attrs:{type:'importmap'},children:JSON.stringify({imports}),injectTo:'head-prepend'}]};}},
  closeBundle(){const target=resolve('out/renderer/vendor/three');mkdirSync(target,{recursive:true});cpSync(resolve('node_modules/three/build'),resolve(target,'build'),{recursive:true});cpSync(resolve('node_modules/three/examples/jsm'),resolve(target,'examples/jsm'),{recursive:true});cpSync(resolve('node_modules/three/LICENSE'),resolve(target,'LICENSE'));}
 };
}
