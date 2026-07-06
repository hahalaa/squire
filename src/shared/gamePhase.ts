import type { Color, Move } from "chess.js";

export type GamePhase = "opening" | "middlegame" | "endgame";

const PIECE_VALUES: Partial<Record<string, number>> = {
  q: 9,
  r: 5,
  b: 3,
  n: 3,
  p: 1,
};

const MIDDLEGAME_MATERIAL_FLOOR = 26;
const OPENING_MOVE_LIMIT = 15;

function fenField(fen: string, index: number): string {
  return fen.trim().split(/\s+/)[index] ?? "";
}

function hasQueenOnBoard(boardField: string): boolean {
  return boardField.includes("q") || boardField.includes("Q");
}

function totalMaterial(boardField: string): number {
  let total = 0;
  for (const char of boardField) {
    total += PIECE_VALUES[char.toLowerCase()] ?? 0;
  }
  return total;
}

function hasCastled(history: Move[], color: Color): boolean {
  // chess.js 1.4.0's Move class documents `isCastle()` in a deprecation
  // comment on the old `flags` field but does not actually implement it —
  // only the two methods below exist at runtime.
  return history.some(
    (move) => move.color === color && (move.isKingsideCastle() || move.isQueensideCastle()),
  );
}

/**
 * Opening/middlegame/endgame per chess-domain.md's "Game phase detection":
 * Opening = moveNumber <= 15 AND queen on board AND neither side castled.
 * Endgame = queens off OR total material (Q9 R5 B3 N3 P1, no kings) < 26.
 * Middlegame = everything else. The material-based endgame check is
 * evaluated first: a low-material position (e.g. bare K+Q vs K reached via
 * a custom starting FEN) is an endgame even if its move counter happens to
 * read <=15, which a strict "opening first" ordering would misclassify.
 * Real openings never have material this low, so this ordering doesn't
 * change the common case.
 */
export function getGamePhase(fen: string, history: Move[]): GamePhase {
  const boardField = fenField(fen, 0);
  const fullmoveNumber = Number(fenField(fen, 5)) || 1;

  const isEndgame = !hasQueenOnBoard(boardField) || totalMaterial(boardField) < MIDDLEGAME_MATERIAL_FLOOR;
  if (isEndgame) return "endgame";

  const isOpening =
    fullmoveNumber <= OPENING_MOVE_LIMIT &&
    hasQueenOnBoard(boardField) &&
    !hasCastled(history, "w") &&
    !hasCastled(history, "b");
  if (isOpening) return "opening";

  return "middlegame";
}
