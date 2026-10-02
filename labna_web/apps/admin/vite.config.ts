import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.LABNA_API_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    // Same-origin proxy keeps the HttpOnly refresh cookie first-party in development,
    // so the admin panel never needs cross-site cookie handling or CORS credentials.
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
