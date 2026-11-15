import { defineConfig } from 'vite';

// base 用相对路径：同一份 dist 既能放在网页上预览，也能被 Capacitor 直接装进安卓 App。
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/game.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        codeSplitting: false,
      },
    },
  },
});
