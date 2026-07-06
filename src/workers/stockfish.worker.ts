// Wraps the raw Stockfish engine (loaded from /public as a classic worker
// script, per frontend-engineer.md's "Stockfish setup") behind a small UCI
// message API. useStockfish() talks to this file; it never touches the raw
// engine directly.

export type StockfishRequest = { type: "evaluate"; fen: string; depth: number } | { type: "stop" };

export type StockfishResponse =
  | { type: "score"; kind: "cp" | "mate"; value: number; depth: number }
  | { type: "bestmove" };

const engine = new Worker("/stockfish-18-lite-single.js");

let ready = false;
let searching = false;
let pending: { fen: string; depth: number } | null = null;

function flushPending() {
  if (!ready || searching || !pending) return;
  const { fen, depth } = pending;
  pending = null;
  searching = true;
  engine.postMessage(`position fen ${fen}`);
  engine.postMessage(`go depth ${depth}`);
}

engine.addEventListener("message", (event: MessageEvent<string>) => {
  const line = event.data;

  if (line === "uciok") {
    engine.postMessage("isready");
    return;
  }

  if (line === "readyok") {
    ready = true;
    flushPending();
    return;
  }

  if (line.startsWith("info") && line.includes(" score ")) {
    const depthMatch = line.match(/\bdepth (\d+)/);
    const depth = depthMatch ? Number(depthMatch[1]) : 0;
    const mateMatch = line.match(/score mate (-?\d+)/);
    const cpMatch = line.match(/score cp (-?\d+)/);
    const response: StockfishResponse | null = mateMatch
      ? { type: "score", kind: "mate", value: Number(mateMatch[1]), depth }
      : cpMatch
        ? { type: "score", kind: "cp", value: Number(cpMatch[1]), depth }
        : null;
    if (response) postMessage(response);
    return;
  }

  if (line.startsWith("bestmove")) {
    searching = false;
    postMessage({ type: "bestmove" } satisfies StockfishResponse);
    flushPending();
  }
});

engine.postMessage("uci");

addEventListener("message", (event: MessageEvent<StockfishRequest>) => {
  const request = event.data;

  if (request.type === "stop") {
    pending = null;
    if (searching) engine.postMessage("stop");
    return;
  }

  pending = { fen: request.fen, depth: request.depth };
  if (searching) {
    engine.postMessage("stop");
  } else {
    flushPending();
  }
});
