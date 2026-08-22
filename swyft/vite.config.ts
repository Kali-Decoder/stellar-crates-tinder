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
      // Market history path (DIA RWA REST is spot-only; series anchored to DIA)
      "/yahoo-api": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-api/, ""),
        secure: true
      }
    }
  },
  build: {
    outDir: "dist/client",
    sourcemap: false
  }
});
