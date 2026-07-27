import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ include: ['buffer'] }) // @solana/web3.js needs Buffer
  ],
  server: {
    port: 5174,
    proxy: {
      // Proxy API calls to the gnosis-card-x402 backend during dev
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    target: 'es2022'
  }
})
