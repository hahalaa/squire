import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/board/useGameState";
import type { StockfishRequest, StockfishResponse } from "@/workers/stockfish.worker";

const SEARCH_DEPTH = 15;

export type EvalScore = { kind: "cp" | "mate"; value: number; depth: number };

export type StockfishState =
  | { status: "loading" }
  | { status: "ready"; score: EvalScore }
  | { status: "error" };

/**
 * Evaluates the position from `game` (the same GameState instance shared
 * with BoardView — never a second useGameState() call) at a fixed depth of
 * 15, debounced to move completion: a new evaluation is only requested when
 * `game.fen` actually changes, and an in-flight search is stopped rather
 * than queued if a new move arrives before it finishes.
 *
 * The returned score is normalized to White's perspective (positive =
 * White favored) — Stockfish's own `score cp`/`score mate` values are
 * relative to the side to move, so a Black-to-move evaluation is negated.
 *
 * "error" covers the Worker failing to construct at all (e.g. the browser
 * blocking module workers) as well as a runtime worker error afterward —
 * both are terminal for this hook instance, since there's no engine left
 * to recover a search from.
 */
export function useStockfish(game: GameState): StockfishState {
  const [state, setState] = useState<StockfishState>({ status: "loading" });
  const workerRef = useRef<Worker | null>(null);
  const turnRef = useRef(game.turn);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/stockfish.worker.ts", import.meta.url));
    } catch {
      setState({ status: "error" });
      return;
    }
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<StockfishResponse>) => {
      const message = event.data;
      if (message.type !== "score") return;
      const perspective = turnRef.current === "b" ? -1 : 1;
      setState({
        status: "ready",
        score: { kind: message.kind, value: message.value * perspective, depth: message.depth },
      });
    };

    worker.onerror = () => {
      setState({ status: "error" });
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
    setState((prev) => (prev.status === "error" ? prev : { status: "loading" }));
    const request: StockfishRequest = { type: "evaluate", fen: game.fen, depth: SEARCH_DEPTH };
    worker.postMessage(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fen]);

  return state;
}
