import { useEffect, useRef, useState } from "react";
import type { ChessGame } from "@/board/useChessGame";
import type { StockfishRequest, StockfishResponse } from "@/workers/stockfish.worker";

const SEARCH_DEPTH = 15;

export type EvalScore = { kind: "cp" | "mate"; value: number; depth: number };

/**
 * Evaluates the position from `game` (the same ChessGame instance shared
 * with BoardView — never a second useChessGame() call) at a fixed depth of
 * 15, debounced to move completion: a new evaluation is only requested when
 * `game.fen` actually changes, and an in-flight search is stopped rather
 * than queued if a new move arrives before it finishes.
 *
 * The returned score is normalized to White's perspective (positive =
 * White favored) — Stockfish's own `score cp`/`score mate` values are
 * relative to the side to move, so a Black-to-move evaluation is negated.
 */
export function useStockfish(game: ChessGame): EvalScore | null {
  const [score, setScore] = useState<EvalScore | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const turnRef = useRef(game.turn);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/stockfish.worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<StockfishResponse>) => {
      const message = event.data;
      if (message.type !== "score") return;
      const perspective = turnRef.current === "b" ? -1 : 1;
      setScore({ kind: message.kind, value: message.value * perspective, depth: message.depth });
    };

    return () => {
      const stop: StockfishRequest = { type: "stop" };
      worker.postMessage(stop);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    turnRef.current = game.turn;
    setScore(null);
    const request: StockfishRequest = { type: "evaluate", fen: game.fen, depth: SEARCH_DEPTH };
    worker.postMessage(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fen]);

  return score;
}
