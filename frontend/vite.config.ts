import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.EVERDRIVE_API_PROXY_TARGET ?? 'http://127.0.0.1:43107';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 43117,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true
      }
    }
  }
});
