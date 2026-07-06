import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { getGamePhase } from "./gamePhase";

function playSan(sanMoves: string[]): Chess {
  const chess = new Chess();
  for (const san of sanMoves) chess.move(san);
  return chess;
}

describe("getGamePhase", () => {
  it("classifies the starting position as opening", () => {
    const chess = new Chess();
    expect(getGamePhase(chess.fen(), chess.history({ verbose: true }))).toBe("opening");
  });

  it("classifies a castled position with material intact as middlegame, not opening", () => {
    const chess = playSan(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"]);
    expect(getGamePhase(chess.fen(), chess.history({ verbose: true }))).toBe("middlegame");
  });

  it("classifies a queen-on, material-intact position past move 15 as middlegame", () => {
    const shuffle = ["Nc3", "Nc6", "Nb1", "Nb8"];
    const chess = new Chess();
    for (let i = 0; i < 10; i++) {
      for (const san of shuffle) chess.move(san);
    }
    expect(Number(chess.fen().split(" ")[5])).toBeGreaterThan(15);
    expect(getGamePhase(chess.fen(), chess.history({ verbose: true }))).toBe("middlegame");
  });

  it("classifies a queenless position as endgame regardless of move number", () => {
    const fen = "4k3/8/8/8/8/8/8/4KR2 w - - 0 3";
    expect(getGamePhase(fen, [])).toBe("endgame");
  });

  it("classifies a low-material position with queens on as endgame", () => {
    const fen = "4k3/8/8/8/8/8/8/3QK3 w - - 0 3";
    expect(getGamePhase(fen, [])).toBe("endgame");
  });

  it("runs in under 5ms (averaged) on a realistic midgame position", () => {
    // A ~20-ply Najdorf: full board, both sides castled, queens on — the
    // castling scan and material count both do real work here, unlike the
    // near-empty starting position.
    const chess = playSan([
      "e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6",
      "Be2", "e5", "Nb3", "Be7", "O-O", "O-O", "Be3", "Be6", "Nd5", "Nbd7",
    ]);
    const fen = chess.fen();
    const history = chess.history({ verbose: true });
    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) getGamePhase(fen, history);
    expect((performance.now() - start) / iterations).toBeLessThan(5);
  });
});
