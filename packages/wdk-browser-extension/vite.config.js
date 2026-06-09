import { defineConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '',   // relative paths required for Chrome extension file:// context
  plugins: [
    nodePolyfills({
      include: ['buffer', 'process', 'util']
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    minify: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/service-worker.js'),
        popup: resolve(__dirname, 'src/popup/index.html')
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js'
          return '[name].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  },
  resolve: {
    conditions: ['browser', 'default']
  }
})
