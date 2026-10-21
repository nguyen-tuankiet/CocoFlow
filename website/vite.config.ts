import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps the built site working from any host or sub-folder (GitHub Pages, Netlify, a plain folder…).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
