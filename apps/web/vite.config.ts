import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "https://outreach-system-api.vercel.app",
        changeOrigin: true,
      },
      "/t": {
        target: "https://outreach-system-api.vercel.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/t/, "/tracking"),
      },
    },
  },
});
