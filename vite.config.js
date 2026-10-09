import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Browser-only Vite config (npm run dev:browser / preview:browser).
 * Desktop builds use electron.vite.config.ts instead.
 */
export default defineConfig({
  root: './',
  publicDir: 'public',
  base: './',
  server: {
    port: 3000,
    strictPort: false,
    cors: true,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'src/core'),
      '@entities': resolve(__dirname, 'src/entities'),
      '@systems': resolve(__dirname, 'src/systems'),
      '@world': resolve(__dirname, 'src/world'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@data': resolve(__dirname, 'src/data'),
      '@render': resolve(__dirname, 'src/render'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@workers': resolve(__dirname, 'src/workers')
    }
  },
  optimizeDeps: {
    include: ['three']
  },
  esbuild: {
    target: 'es2022'
  }
});
