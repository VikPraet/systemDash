import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.SYSTEMDASH_API_TARGET || "http://localhost:3001";
  const port = Number(env.SYSTEMDASH_WEB_PORT) || 5273;

  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        // `ws: true` lets the terminal's WebSocket (/api/terminal) proxy through too.
        "/api": {
          target: apiTarget,
          ws: true,
          changeOrigin: true,
          timeout: 600_000,
          proxyTimeout: 600_000,
        },
      },
    },
  };
});
