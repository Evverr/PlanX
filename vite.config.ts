/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SYNC_PORT = Number(process.env.PLANX_PORT ?? 1234);

export default defineConfig({
  plugins: [react()],
  // The board, and the showcase of its panels and popups (showcase.html, see src/showcase).
  build: { rollupOptions: { input: { main: 'index.html', showcase: 'showcase.html' } } },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: `ws://localhost:${SYNC_PORT}`, ws: true },
      '/history': { target: `http://localhost:${SYNC_PORT}` },
    },
  },
  test: {
    environment: 'node',
  },
});
