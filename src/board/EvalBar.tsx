import type { ChessGame } from "@/board/useChessGame";
import { useStockfish, type EvalScore } from "@/board/useStockfish";

const CP_CLAMP = 1000; // ±10 pawns fills the bar

interface EvalBarProps {
  game: ChessGame;
  orientation: "white" | "black";
}

function whiteFillPercent(score: EvalScore): number {
  if (score.kind === "mate") return score.value >= 0 ? 100 : 0;
  const clamped = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, score.value));
  return 50 + (clamped / CP_CLAMP) * 50;
}

function formatScore(score: EvalScore): string {
  if (score.kind === "mate") {
    if (score.value === 0) return "M0";
    return score.value > 0 ? `M${score.value}` : `-M${Math.abs(score.value)}`;
  }
  const pawns = score.value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

export function EvalBar({ game, orientation }: EvalBarProps) {
  const state = useStockfish(game);
  const whiteOnTop = orientation === "black";

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-[480px] w-6 items-center justify-center rounded-md border border-secondary bg-muted">
          <span className="[writing-mode:vertical-rl] text-[10px] text-muted-foreground">
            Engine unavailable
          </span>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="h-[480px] w-6 animate-pulse rounded-md border border-secondary bg-muted" />
        <span className="font-mono text-xs text-muted-foreground">…</span>
      </div>
    );
  }

  const whitePercent = whiteFillPercent(state.score);
  const whiteSegment = <div style={{ height: `${whitePercent}%` }} className="bg-[#e8e4d9]" />;
  const blackSegment = <div style={{ height: `${100 - whitePercent}%` }} className="bg-[#1a1a2e]" />;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-[480px] w-6 flex-col overflow-hidden rounded-md border border-secondary">
        {whiteOnTop ? whiteSegment : blackSegment}
        {whiteOnTop ? blackSegment : whiteSegment}
      </div>
      <span className="font-mono text-xs text-muted-foreground">{formatScore(state.score)}</span>
    </div>
  );
}
