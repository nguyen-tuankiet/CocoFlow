import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps the built site working from any host or sub-folder (GitHub Pages, Netlify, a plain folder…).
// admin.html is the private statistics page (served as /admin on Vercel, see vercel.json).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3001" } }, // local testing only: scratch server that runs api/*.ts
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), admin: resolve(__dirname, "admin.html") } },
  },
});
