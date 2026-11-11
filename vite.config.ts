import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main-[hash].js',
        chunkFileNames: 'assets/scene-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true }
});
