import type { Color, PieceSymbol, Square } from "chess.js";

export type Concept =
  | { type: "passedPawn"; color: Color; square: Square }
  | { type: "isolatedPawn"; color: Color; square: Square }
  | { type: "doubledPawns"; color: Color; file: string }
  | { type: "openFile"; file: string }
  // `color` is the side FOR WHOM the file is half-open, i.e. the side with
  // no pawn on it (the file is fully open from that side's rooks/queen).
  | { type: "halfOpenFile"; color: Color; file: string }
  | { type: "weakSquare"; color: Color; square: Square }
  | { type: "bishopPair"; color: Color };

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const WEAK_SQUARE_MIN_RANK = 3;
const WEAK_SQUARE_MAX_RANK = 6;

interface BoardPiece {
  color: Color;
  type: PieceSymbol;
}

function toSquare(fileIdx: number, rank: number): Square {
  return `${FILES[fileIdx]}${rank}` as Square;
}

/** Parses a FEN's piece-placement field directly into a square -> piece map. */
function parseBoard(fen: string): Map<string, BoardPiece> {
  const board = new Map<string, BoardPiece>();
  const placement = fen.trim().split(/\s+/)[0] ?? "";
  const rankStrings = placement.split("/");
  rankStrings.forEach((rankString, rankIdx) => {
    const rank = 8 - rankIdx;
    let file = 0;
    for (const char of rankString) {
      if (/[1-8]/.test(char)) {
        file += Number(char);
        continue;
      }
      const color: Color = char === char.toUpperCase() ? "w" : "b";
      const type = char.toLowerCase() as PieceSymbol;
      board.set(toSquare(file, rank), { color, type });
      file += 1;
    }
  });
  return board;
}

function pawnRanksByFile(board: Map<string, BoardPiece>, color: Color): number[][] {
  const ranksByFile: number[][] = FILES.map(() => []);
  for (const [square, piece] of board) {
    if (piece.type !== "p" || piece.color !== color) continue;
    const fileIdx = FILES.indexOf(square[0] as (typeof FILES)[number]);
    const rank = Number(square.slice(1));
    ranksByFile[fileIdx].push(rank);
  }
  return ranksByFile;
}

function detectPawnStructureConcepts(board: Map<string, BoardPiece>): Concept[] {
  const concepts: Concept[] = [];
  const whitePawns = pawnRanksByFile(board, "w");
  const blackPawns = pawnRanksByFile(board, "b");

  for (let file = 0; file < 8; file++) {
    const white = whitePawns[file];
    const black = blackPawns[file];

    if (white.length === 0 && black.length === 0) {
      concepts.push({ type: "openFile", file: FILES[file] });
    } else if (white.length === 0) {
      concepts.push({ type: "halfOpenFile", color: "w", file: FILES[file] });
    } else if (black.length === 0) {
      concepts.push({ type: "halfOpenFile", color: "b", file: FILES[file] });
    }

    for (const [color, ownFiles] of [
      ["w", whitePawns],
      ["b", blackPawns],
    ] as const) {
      const ownCount = ownFiles[file].length;
      if (ownCount >= 2) {
        concepts.push({ type: "doubledPawns", color, file: FILES[file] });
      }

      const leftHasOwn = file > 0 && ownFiles[file - 1].length > 0;
      const rightHasOwn = file < 7 && ownFiles[file + 1].length > 0;
      if (ownCount > 0 && !leftHasOwn && !rightHasOwn) {
        for (const rank of ownFiles[file]) {
          concepts.push({ type: "isolatedPawn", color, square: toSquare(file, rank) });
        }
      }
    }
  }

  for (const [color, ownFiles, enemyFiles] of [
    ["w", whitePawns, blackPawns],
    ["b", blackPawns, whitePawns],
  ] as const) {
    for (let file = 0; file < 8; file++) {
      for (const rank of ownFiles[file]) {
        const isBlocked = [file - 1, file, file + 1].some((f) => {
          if (f < 0 || f > 7) return false;
          return enemyFiles[f].some((enemyRank) =>
            color === "w" ? enemyRank > rank : enemyRank < rank,
          );
        });
        if (!isBlocked) {
          concepts.push({ type: "passedPawn", color, square: toSquare(file, rank) });
        }
      }
    }
  }

  return concepts;
}

/** A same-color pawn on an adjacent file can still be pushed to guard `rank`. */
function canPawnEverGuard(color: Color, pawnRank: number, rank: number): boolean {
  return color === "w" ? pawnRank < rank : pawnRank > rank;
}

function detectWeakSquares(board: Map<string, BoardPiece>): Concept[] {
  const concepts: Concept[] = [];
  const whitePawns = pawnRanksByFile(board, "w");
  const blackPawns = pawnRanksByFile(board, "b");

  for (const [color, ownPawns] of [
    ["w", whitePawns],
    ["b", blackPawns],
  ] as const) {
    for (let file = 0; file < 8; file++) {
      for (let rank = WEAK_SQUARE_MIN_RANK; rank <= WEAK_SQUARE_MAX_RANK; rank++) {
        const square = toSquare(file, rank);
        if (board.has(square)) continue; // only empty squares count as "holes"

        const coverable = [file - 1, file + 1].some((f) => {
          if (f < 0 || f > 7) return false;
          return ownPawns[f].some((pawnRank) => canPawnEverGuard(color, pawnRank, rank));
        });
        if (!coverable) {
          concepts.push({ type: "weakSquare", color, square });
        }
      }
    }
  }

  return concepts;
}

function isLightSquare(square: Square): boolean {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square.slice(1));
  return (file + rank) % 2 === 1;
}

function detectBishopPairs(board: Map<string, BoardPiece>): Concept[] {
  const concepts: Concept[] = [];
  for (const color of ["w", "b"] as const) {
    const bishopSquares: Square[] = [];
    for (const [square, piece] of board) {
      if (piece.type === "b" && piece.color === color) {
        bishopSquares.push(square as Square);
      }
    }
    if (bishopSquares.length === 2 && isLightSquare(bishopSquares[0]) !== isLightSquare(bishopSquares[1])) {
      concepts.push({ type: "bishopPair", color });
    }
  }
  return concepts;
}

/**
 * Passed pawn, isolated pawn, doubled pawns, open/half-open file, weak
 * square, bishop pair — parsed directly from the FEN board string,
 * rule-based, synchronous, <5ms. Free-play/analysis only, mirroring
 * moveClassifier.ts's scope.
 */
export function detectConcepts(fen: string): Concept[] {
  const board = parseBoard(fen);
  return [
    ...detectPawnStructureConcepts(board),
    ...detectWeakSquares(board),
    ...detectBishopPairs(board),
  ];
}
