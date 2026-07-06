import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { detectConcepts } from "./conceptDetector";

describe("detectConcepts", () => {
  it("detects a passed pawn with no blocking or contesting enemy pawns", () => {
    const fen = "4k3/8/8/4P3/8/8/8/4K3 w - - 0 1";
    expect(detectConcepts(fen)).toContainEqual({ type: "passedPawn", color: "w", square: "e5" });
  });

  it("does not call a pawn passed if an enemy pawn on an adjacent file can still contest it", () => {
    const fen = "4k3/8/5p2/4P3/8/8/8/4K3 w - - 0 1";
    expect(detectConcepts(fen)).not.toContainEqual({ type: "passedPawn", color: "w", square: "e5" });
  });

  it("detects isolated pawns with no same-color pawn on either adjacent file", () => {
    const fen = "4k3/8/8/8/8/8/2P1P3/4K3 w - - 0 1";
    const concepts = detectConcepts(fen);
    expect(concepts).toContainEqual({ type: "isolatedPawn", color: "w", square: "c2" });
    expect(concepts).toContainEqual({ type: "isolatedPawn", color: "w", square: "e2" });
  });

  it("detects doubled pawns on the same file", () => {
    const fen = "4k3/8/8/8/8/2P5/2P5/4K3 w - - 0 1";
    expect(detectConcepts(fen)).toContainEqual({ type: "doubledPawns", color: "w", file: "c" });
  });

  it("detects a fully open file when neither side has a pawn on it", () => {
    const fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
    const concepts = detectConcepts(fen);
    expect(concepts.filter((c) => c.type === "openFile")).toHaveLength(8);
  });

  it("detects a half-open file for the side with no pawn on it", () => {
    const fen = "4k3/8/8/8/3p4/8/8/4K3 w - - 0 1";
    expect(detectConcepts(fen)).toContainEqual({ type: "halfOpenFile", color: "w", file: "d" });
  });

  it("detects a weak square uncoverable by either adjacent-file pawn", () => {
    const fen = "4k3/8/4p3/8/8/8/P6P/4K3 w - - 0 1";
    const concepts = detectConcepts(fen);
    expect(concepts).toContainEqual({ type: "weakSquare", color: "w", square: "d5" });
    expect(concepts).not.toContainEqual({ type: "weakSquare", color: "b", square: "d5" });
  });

  it("detects the bishop pair when both bishops sit on opposite-colored squares", () => {
    const fen = "4k3/8/8/8/8/8/8/2B2BK1 w - - 0 1";
    expect(detectConcepts(fen)).toContainEqual({ type: "bishopPair", color: "w" });
  });

  it("does not report a bishop pair with only one bishop", () => {
    const fen = "4k3/8/8/8/8/8/8/2B3K1 w - - 0 1";
    expect(detectConcepts(fen).filter((c) => c.type === "bishopPair")).toHaveLength(0);
  });

  it("runs in under 5ms (averaged) on a realistic midgame position", () => {
    // A ~20-ply Najdorf middlegame — a full board with real pawn structure
    // to scan for passed/isolated/doubled pawns, open files and holes,
    // rather than the near-best-case starting position.
    const chess = new Chess();
    for (const san of [
      "e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6",
      "Be2", "e5", "Nb3", "Be7", "O-O", "O-O", "Be3", "Be6", "Nd5", "Nbd7",
    ]) {
      chess.move(san);
    }
    const fen = chess.fen();
    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) detectConcepts(fen);
    expect((performance.now() - start) / iterations).toBeLessThan(5);
  });
});
