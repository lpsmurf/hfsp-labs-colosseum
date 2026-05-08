import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/chat': {
        target: 'http://localhost:8787',
        changeOrigin: true
      },
      '/api/platform': {
        target: 'http://localhost:8788',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/platform/, '/api')
      },
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  },
  base: '/try/',
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
