import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  publicDir: 'resources',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'ReciprocalLatticeViewerHeadless.html'),
      },
    },
    assetsDir: 'assets',
  },
});
