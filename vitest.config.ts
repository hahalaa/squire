import { defineConfig } from "vitest/config";

// Scoped narrow per CHESS-007: unit + timing tests for pure, synchronous logic
// modules (node environment). CHESS-008 adds server-side tests — pure modules
// (server/cache.ts, FEN normalization) plus Express routes driven through the
// real app via supertest. Still no jsdom / @testing-library here: component and
// hook rendering is verified by manual/audit review, not automated rendering.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    // Populates required env vars with test placeholders before any server
    // module imports server/env.ts (which process.exit(1)s on a missing var).
    setupFiles: ["./server/test/env-setup.ts"],
  },
});
