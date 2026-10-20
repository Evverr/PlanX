/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SYNC_PORT = Number(process.env.MIRA_PORT ?? 1234);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: `ws://localhost:${SYNC_PORT}`, ws: true },
    },
  },
  test: {
    environment: 'node',
  },
});
