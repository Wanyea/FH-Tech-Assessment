import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist/client",
  },
  server: {
    port: 5173,
    proxy: {
      "/file-upload": "http://127.0.0.1:3000",
      "/health": "http://127.0.0.1:3000",
    },
  },
});
