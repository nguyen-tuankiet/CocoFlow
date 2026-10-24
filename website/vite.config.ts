import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps the built site working from any host or sub-folder (GitHub Pages, Netlify, a plain folder…).
// admin.html is the private statistics page and scan.html the document-straightening tool (served as /admin and /scan on
// Vercel, see vercel.json).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3001" } }, // local testing only: scratch server that runs api/*.ts
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), admin: fileURLToPath(new URL("./admin.html", import.meta.url)), scan: fileURLToPath(new URL("./scan.html", import.meta.url)) } },
  },
});
