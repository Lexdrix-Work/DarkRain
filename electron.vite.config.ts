import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';
import {lowMemoryVendor} from './scripts/low-memory-vendor';
// Use exact local prebuilt renderer modules by default, avoiding the build's
// large Three.js AST peak. Opt out for a fully bundled comparison build.
const lean=process.env.DARKRAIN_LOW_MEMORY_BUILD!=='0';
export default defineConfig({
    main:{build:{rollupOptions:{input:resolve('src/main/index.ts')}}},
    preload:{build:{rollupOptions:{input:resolve('src/preload/index.ts'),output:{format:'cjs',entryFileNames:'index.cjs'}}}},
    renderer:{root:'.',base:'./',plugins:lean?[lowMemoryVendor()]:[],build:{outDir:'out/renderer',rollupOptions:{external:lean?id=>id==='three'||id.startsWith('three/'):undefined,input:{game:resolve('index.html'),fidelity:resolve('scripts/fidelity-fixture.html'),fx:resolve('scripts/fx-fixture.html'),shadows:resolve('scripts/shadow-fixture.html')}}},server:{port:5173,strictPort:true}}
});
