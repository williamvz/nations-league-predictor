import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes every asset URL relative, so the same build works on a bare
// port AND behind Home Assistant ingress (/api/hassio_ingress/<token>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8099',
    },
  },
});
