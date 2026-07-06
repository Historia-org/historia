import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API métier
      "/api": "http://localhost:3001",
      // Tuiles Martin (Phase 1)
      "/tiles": {
        target: "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/tiles/, ""),
      },
    },
  },
});
