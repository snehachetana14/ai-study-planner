import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, calls to /api are forwarded to the Express server on port 5000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
