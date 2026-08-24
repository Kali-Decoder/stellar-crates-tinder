import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";

const liveUi = process.env.VITE_LIVE_UI === "true";
const privyStub = path.resolve(__dirname, "src/client/stubs/privy-stub.tsx");
const permissionlessStub = path.resolve(
  __dirname,
  "src/client/stubs/permissionless-stub.ts",
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Default production build is mock-only — stub Privy / optional peers so
      // the Stellar Freighter UI can ship without live-stack dependencies.
      ...(liveUi
        ? {}
        : {
            "@privy-io/react-auth/smart-wallets": privyStub,
            "@privy-io/react-auth/solana": privyStub,
            "@privy-io/react-auth/ui": privyStub,
            "@privy-io/react-auth": privyStub,
            permissionless: permissionlessStub,
            "permissionless/accounts": permissionlessStub,
            "@solana-program/memo": permissionlessStub,
            [path.resolve(__dirname, "src/client/App.tsx")]: path.resolve(
              __dirname,
              "src/client/App.stub.tsx",
            ),
            [path.resolve(__dirname, "src/client/LiveRoot.tsx")]: path.resolve(
              __dirname,
              "src/client/LiveRoot.stub.tsx",
            ),
            [path.resolve(__dirname, "src/client/components/WalletMenu.tsx")]:
              path.resolve(__dirname, "src/client/components/live-only.stub.tsx"),
            [path.resolve(__dirname, "src/client/components/PositionsScreen.tsx")]:
              path.resolve(__dirname, "src/client/components/live-only.stub.tsx"),
            [path.resolve(__dirname, "src/client/components/ReviewScreen.tsx")]:
              path.resolve(__dirname, "src/client/components/live-only.stub.tsx"),
            [path.resolve(__dirname, "src/client/components/Onboarding.tsx")]:
              path.resolve(__dirname, "src/client/components/live-only.stub.tsx"),
          }),
    },
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
        secure: true,
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
    },
  },
  build: {
    outDir: "dist/client",
    sourcemap: false,
  },
});
