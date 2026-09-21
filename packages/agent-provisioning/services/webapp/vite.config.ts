import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        headers: {
          'X-HFSP-API-Key': 'test-dev-key-12345',
        },
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
