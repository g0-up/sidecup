import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Cùng origin với API ở dev: không cần CORS, cookie phiên và WebSocket chạy như production.
    proxy: {
      "/api": { target: apiTarget, xfwd: true },
      "/internal": { target: apiTarget, xfwd: true },
      "/ws": { target: apiTarget, ws: true, xfwd: true },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": { target: apiTarget, xfwd: true },
      "/ws": { target: apiTarget, ws: true, xfwd: true },
    },
  },
  build: {
    manifest: true,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return "react-vendor";
          return undefined;
        },
      },
    },
  },
});
