import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // 'iife' (classic script) is Vite's actual current default, but pinned
  // explicitly and defensively — see frontend-engineer.md's "Stockfish
  // setup". stockfish.worker.ts relies on classic-script worker loading.
  worker: {
    format: "iife",
  },
});
