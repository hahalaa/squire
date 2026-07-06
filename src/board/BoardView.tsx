import { useCallback, useMemo, useState } from "react";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import type { Color, Move, Square } from "chess.js";
import { Button } from "@/components/ui/button";
import type { ChessGame } from "@/board/useChessGame";
import { PromotionDialog } from "@/board/PromotionDialog";
import { PIECE_GLYPHS } from "@/board/pieceGlyphs";
import { EvalBar } from "@/board/EvalBar";

const LAST_MOVE_STYLE: React.CSSProperties = {
  backgroundColor: "rgba(201, 168, 76, 0.25)",
};

const SELECTED_SQUARE_STYLE: React.CSSProperties = {
  boxShadow: "inset 0 0 0 2px #c9a84c",
};

const LEGAL_TARGET_STYLE: React.CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgba(201, 168, 76, 0.55) 22%, transparent 24%)",
};

interface BoardViewProps {
  game: ChessGame;
  // Orientation is a pure view concern (chess.js/ChessGame has no notion of
  // it) — lifted to AuthedApp.tsx as its own state, alongside useChessGame(),
  // and passed down here so EvalBar can share the same flip state as the
  // board without either owning it.
  orientation: "white" | "black";
  onFlipOrientation: () => void;
}

export function BoardView({ game, orientation, onFlipOrientation }: BoardViewProps) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  const {
    fen,
    turn,
    lastMove,
    capturedPieces,
    history,
    legalTargets,
    pieceAt,
    attemptMove,
    isGameOver,
    isCheckmate,
    isStalemate,
    isInsufficientMaterial,
    isThreefoldRepetition,
    isDrawByFiftyMoves,
  } = game;

  const clearSelection = useCallback(() => setSelectedSquare(null), []);

  const trySelectOrMove = useCallback(
    (square: Square) => {
      if (game.pendingPromotion) return;

      if (selectedSquare === square) {
        clearSelection();
        return;
      }

      if (selectedSquare && legalTargets(selectedSquare).includes(square)) {
        attemptMove(selectedSquare, square);
        clearSelection();
        return;
      }

      const piece = pieceAt(square);
      if (piece && piece.color === turn) {
        setSelectedSquare(square);
      } else {
        clearSelection();
      }
    },
    [attemptMove, clearSelection, game.pendingPromotion, legalTargets, pieceAt, selectedSquare, turn],
  );

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { ...styles[lastMove.from], ...LAST_MOVE_STYLE };
      styles[lastMove.to] = { ...styles[lastMove.to], ...LAST_MOVE_STYLE };
    }
    if (selectedSquare) {
      styles[selectedSquare] = { ...styles[selectedSquare], ...SELECTED_SQUARE_STYLE };
      for (const target of legalTargets(selectedSquare)) {
        styles[target] = { ...styles[target], ...LEGAL_TARGET_STYLE };
      }
    }
    return styles;
  }, [lastMove, legalTargets, selectedSquare]);

  const options: ChessboardOptions = {
    position: fen,
    boardOrientation: orientation,
    animationDurationInMs: 150,
    showNotation: true,
    squareStyles,
    canDragPiece: ({ piece }) => piece.pieceType[0] === turn,
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      clearSelection();
      if (!targetSquare) return false;
      try {
        return attemptMove(sourceSquare as Square, targetSquare as Square);
      } catch {
        return false;
      }
    },
    onSquareClick: ({ square }) => {
      try {
        trySelectOrMove(square as Square);
      } catch {
        clearSelection();
      }
    },
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex items-center">
        <EvalBar game={game} orientation={orientation} />
      </div>

      <div className="flex flex-col items-center gap-3">
        <GameStatus
          isGameOver={isGameOver}
          isCheckmate={isCheckmate}
          isStalemate={isStalemate}
          isInsufficientMaterial={isInsufficientMaterial}
          isThreefoldRepetition={isThreefoldRepetition}
          isDrawByFiftyMoves={isDrawByFiftyMoves}
          turn={turn}
        />
        <div className="w-full max-w-[480px]">
          <Chessboard options={options} />
        </div>
        <Button variant="secondary" onClick={onFlipOrientation}>
          Flip board
        </Button>
      </div>

      <div className="flex w-full flex-col gap-4 lg:w-64">
        {/* "White captured" = pieces White has taken, i.e. black pieces
            removed from the board, so it reads from capturedPieces.b. */}
        <CapturedPieces label="White captured" color="b" pieces={capturedPieces.b} />
        <CapturedPieces label="Black captured" color="w" pieces={capturedPieces.w} />
        <MoveHistory moves={history} />
      </div>

      <PromotionDialog
        pending={game.pendingPromotion}
        onSelect={game.resolvePromotion}
        onCancel={game.cancelPromotion}
      />
    </div>
  );
}

function GameStatus({
  isGameOver,
  isCheckmate,
  isStalemate,
  isInsufficientMaterial,
  isThreefoldRepetition,
  isDrawByFiftyMoves,
  turn,
}: {
  isGameOver: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isInsufficientMaterial: boolean;
  isThreefoldRepetition: boolean;
  isDrawByFiftyMoves: boolean;
  turn: Color;
}) {
  if (!isGameOver) return null;

  const winner = turn === "w" ? "Black" : "White";
  const message = isCheckmate
    ? `Checkmate — ${winner} wins`
    : isStalemate
      ? "Stalemate — draw"
      : isInsufficientMaterial
        ? "Draw — insufficient material"
        : isThreefoldRepetition
          ? "Draw — threefold repetition"
          : isDrawByFiftyMoves
            ? "Draw — 50-move rule"
            : "Draw";

  return (
    <p className="rounded-md bg-secondary px-4 py-2 text-center font-display text-lg text-primary">{message}</p>
  );
}

function CapturedPieces({
  label,
  color,
  pieces,
}: {
  label: string;
  color: "w" | "b";
  pieces: ("p" | "n" | "b" | "r" | "q" | "k")[];
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="min-h-6 text-xl leading-none">
        {pieces.map((piece, i) => (
          <span key={i}>{PIECE_GLYPHS[color][piece]}</span>
        ))}
      </p>
    </div>
  );
}

function MoveHistory({ moves }: { moves: Move[] }) {
  // Grouped by each move's own `.color`, not array-index parity — a game
  // loaded from a custom FEN (e.g. a drill position) can start with Black to
  // move, and index-parity pairing would mislabel that first Black move as
  // White's.
  const rows: { white?: string; black?: string }[] = [];
  for (const move of moves) {
    const last = rows[rows.length - 1];
    if (move.color === "w" || !last || last.black !== undefined || last.white === undefined) {
      if (move.color === "w") {
        rows.push({ white: move.san });
      } else {
        rows.push({ black: move.san });
      }
    } else {
      last.black = move.san;
    }
  }

  return (
    <div>
      <p className="mb-1 text-sm text-muted-foreground">Moves</p>
      <ol className="max-h-64 space-y-0.5 overflow-y-auto text-sm">
        {rows.map(({ white, black }, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-6 text-muted-foreground">{i + 1}.</span>
            <span className="w-16">{white ?? ""}</span>
            <span className="w-16">{black ?? ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

