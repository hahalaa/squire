import { useCallback, useMemo, useState } from "react";
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

export type PromotionPiece = Exclude<PieceSymbol, "p" | "k">;

export type PendingPromotion = {
  from: Square;
  to: Square;
  color: Color;
};

export type CapturedPieces = Record<Color, PieceSymbol[]>;

export interface GameState {
  fen: string;
  turn: Color;
  history: Move[];
  lastMove: { from: Square; to: Square } | null;
  capturedPieces: CapturedPieces;
  isGameOver: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isInsufficientMaterial: boolean;
  isThreefoldRepetition: boolean;
  isDrawByFiftyMoves: boolean;
  isCheck: boolean;
  pendingPromotion: PendingPromotion | null;
  legalTargets: (square: Square) => Square[];
  pieceAt: (square: Square) => { color: Color; type: PieceSymbol } | undefined;
  attemptMove: (from: Square, to: Square) => boolean;
  resolvePromotion: (piece: PromotionPiece) => void;
  cancelPromotion: () => void;
  reset: () => void;
}

/**
 * Canonical chess game state, called exactly once in AuthedApp.tsx and
 * passed down as a prop to every component that needs it (BoardView,
 * EvalBar via useStockfish). Board orientation is deliberately NOT part of
 * this hook (see AuthedApp.tsx) — it's a pure view concern chess.js has no
 * notion of, kept as its own sibling state.
 */
export function useGameState(initialFen?: string): GameState {
  const [chess] = useState(() => new Chess(initialFen));
  const [fen, setFen] = useState(chess.fen());
  const [history, setHistory] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const capturedPieces = useMemo<CapturedPieces>(() => {
    const captured: CapturedPieces = { w: [], b: [] };
    for (const move of history) {
      if (move.captured) {
        // A capturing move belongs to `move.color`; the captured piece
        // belonged to the opposing side.
        captured[move.color === "w" ? "b" : "w"].push(move.captured);
      }
    }
    return captured;
  }, [history]);

  const legalTargets = useCallback(
    (square: Square): Square[] =>
      chess.moves({ square, verbose: true }).map((move) => move.to),
    [chess],
  );

  const pieceAt = useCallback(
    (square: Square) => chess.get(square),
    // fen included so callers re-derive after every move, since chess.get()
    // reads live off the mutable chess.js instance rather than off `fen`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chess, fen],
  );

  const syncFromChess = useCallback(() => {
    setFen(chess.fen());
    setHistory(chess.history({ verbose: true }));
  }, [chess]);

  const attemptMove = useCallback(
    (from: Square, to: Square): boolean => {
      const candidates = chess.moves({ square: from, verbose: true });
      const candidate = candidates.find((move) => move.to === to);
      if (!candidate) {
        return false;
      }

      if (candidate.isPromotion()) {
        setPendingPromotion({ from, to, color: candidate.color });
        return false;
      }

      try {
        chess.move({ from, to });
      } catch {
        return false;
      }
      setLastMove({ from, to });
      syncFromChess();
      return true;
    },
    [chess, syncFromChess],
  );

  const resolvePromotion = useCallback(
    (piece: PromotionPiece) => {
      if (!pendingPromotion) return;
      const { from, to } = pendingPromotion;
      try {
        chess.move({ from, to, promotion: piece });
      } catch {
        setPendingPromotion(null);
        return;
      }
      setLastMove({ from, to });
      setPendingPromotion(null);
      syncFromChess();
    },
    [chess, pendingPromotion, syncFromChess],
  );

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
  }, []);

  const reset = useCallback(() => {
    if (initialFen) {
      chess.load(initialFen);
    } else {
      chess.reset();
    }
    setPendingPromotion(null);
    setLastMove(null);
    syncFromChess();
  }, [chess, initialFen, syncFromChess]);

  return {
    fen,
    turn: chess.turn(),
    history,
    lastMove,
    capturedPieces,
    isGameOver: chess.isGameOver(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isInsufficientMaterial: chess.isInsufficientMaterial(),
    isThreefoldRepetition: chess.isThreefoldRepetition(),
    isDrawByFiftyMoves: chess.isDrawByFiftyMoves(),
    isCheck: chess.isCheck(),
    pendingPromotion,
    legalTargets,
    pieceAt,
    attemptMove,
    resolvePromotion,
    cancelPromotion,
    reset,
  };
}
