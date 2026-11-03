import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Telegram Mini App: served over HTTPS; polyfill Buffer/process for web3.js.
export default defineConfig({
  plugins: [react()],
  define: { "global": "globalThis" },
  resolve: { alias: { buffer: "buffer" } },
  optimizeDeps: { esbuildOptions: { define: { global: "globalThis" } } },
});
