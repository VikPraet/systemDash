import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // `ws: true` lets the terminal's WebSocket (/api/terminal) proxy through too.
      "/api": { target: "http://localhost:3001", ws: true },
    },
  },
});
