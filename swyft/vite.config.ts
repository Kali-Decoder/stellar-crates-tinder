import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  root: ".",
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.API_PROXY_TARGET ?? "http://localhost:8787",
      // Browser CORS bypass for DIA RWA spot quotes
      "/dia-api": {
        target: "https://api.diadata.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dia-api/, ""),
        secure: true
      },
      // Market history path (DIA RWA REST is spot-only; series anchored to DIA).
      // Yahoo is flaky from some networks — return 503 JSON so the client can
      // fall back to DIA-anchored synthetic charts instead of hanging.
      "/yahoo-api": {
        target: "https://query2.finance.yahoo.com",
        changeOrigin: true,
        secure: true,
        timeout: 8_000,
        proxyTimeout: 8_000,
        rewrite: (path) => path.replace(/^\/yahoo-api/, ""),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
        },
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            const response = res as {
              headersSent?: boolean;
              writeHead?: (code: number, headers: Record<string, string>) => void;
              end?: (body: string) => void;
            };
            if (response && !response.headersSent && response.writeHead && response.end) {
              response.writeHead(503, { "Content-Type": "application/json" });
              response.end(JSON.stringify({ error: "yahoo_proxy_unavailable" }));
            }
          });
        },
      },
    }
  },
  build: {
    outDir: "dist/client",
    sourcemap: false
  }
});
