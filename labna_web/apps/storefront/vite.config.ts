import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.LABNA_API_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: true },
});
