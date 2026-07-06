import { defineConfig } from "vitest/config";

// Scoped narrow per CHESS-007: unit + timing tests for pure, synchronous
// logic modules only (node environment). No jsdom / @testing-library here —
// useGameState() and its consumers are verified by manual/audit review.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
