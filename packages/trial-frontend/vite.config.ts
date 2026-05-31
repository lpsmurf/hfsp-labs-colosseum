import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// AUDIT: LOW — No code splitting or dynamic imports configured. Wallet adapter
// libraries can add ~300KB+ to the bundle. Consider adding manualChunks to split
// vendors (e.g., @solana/wallet-adapter-base, @solana/web3.js) and using dynamic
// import() for heavy pages like DeployZK.
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
      '/vault': {
        target: 'http://localhost:8788',
        changeOrigin: true
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
