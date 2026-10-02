import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:8080";

// Thẻ chia sẻ cần URL tuyệt đối, mà hostname khác nhau theo nơi deploy: lấy từ VITE_PUBLIC_ORIGIN lúc build.
// Bỏ trống (dev, E2E) thì không chèn og:url, og:image và canonical.
function publicOriginTags(origin: string): Plugin {
  const base = origin.trim().replace(/\/+$/, "");
  return {
    name: "public-origin-tags",
    transformIndexHtml() {
      if (!base) return [];
      const meta = (property: string, content: string) => ({ tag: "meta", attrs: { property, content }, injectTo: "head" as const });
      return [
        meta("og:url", `${base}/`),
        meta("og:image", `${base}/og-image.png`),
        meta("og:image:width", "1200"),
        meta("og:image:height", "630"),
        // Đúng chữ vẽ trên public/og-image.png (scripts/render-og-image.mjs); đổi ảnh thì đổi cả dòng này.
        meta("og:image:alt", "Gọi nước tại bàn. Quét QR, đặt nước, trả tiền khi nhận."),
        { tag: "link", attrs: { rel: "canonical", href: `${base}/` }, injectTo: "head" },
      ];
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), publicOriginTags(loadEnv(mode, process.cwd(), "VITE_").VITE_PUBLIC_ORIGIN ?? "")],
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
}));
