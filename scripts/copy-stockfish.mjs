// Copies the Stockfish "lite-single" WASM engine assets from the installed
// `stockfish` npm package into /public so Vite serves them for the Web Worker.
// Runs on postinstall. Git-ignores its outputs (see .gitignore) — the 7.3 MB
// .wasm is regenerated on every install rather than committed.
//
// Asset names confirmed against stockfish@18.0.8 (files live under bin/).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const srcDir = join(root, "node_modules", "stockfish", "bin");
const destDir = join(root, "public");

const assets = ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"];

try {
  mkdirSync(destDir, { recursive: true });
  for (const file of assets) {
    copyFileSync(join(srcDir, file), join(destDir, file));
    console.log(`[copy-stockfish] ${file} -> public/`);
  }
} catch (err) {
  // Non-fatal: the package may not be installed yet (e.g. a bare `npm i`
  // resolving the tree before node_modules is populated). Warn, don't fail.
  console.warn(
    `[copy-stockfish] skipped (${err.code ?? err.message}). ` +
      "Stockfish assets not copied; run `npm install` again if this persists.",
  );
}
