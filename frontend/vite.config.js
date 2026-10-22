import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Disable compression so SSE chunks are forwarded as they arrive.
        headers: { 'Accept-Encoding': 'identity' },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
