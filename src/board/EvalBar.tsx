import type { ChessGame } from "@/board/useChessGame";
import { useStockfish } from "@/board/useStockfish";

const CP_CLAMP = 1000; // ±10 pawns fills the bar

interface EvalBarProps {
  game: ChessGame;
  orientation: "white" | "black";
}

function whiteFillPercent(score: ReturnType<typeof useStockfish>): number {
  if (!score) return 50;
  if (score.kind === "mate") return score.value >= 0 ? 100 : 0;
  const clamped = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, score.value));
  return 50 + (clamped / CP_CLAMP) * 50;
}

function formatScore(score: ReturnType<typeof useStockfish>): string {
  if (!score) return "0.0";
  if (score.kind === "mate") {
    if (score.value === 0) return "M0";
    return score.value > 0 ? `M${score.value}` : `-M${Math.abs(score.value)}`;
  }
  const pawns = score.value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

export function EvalBar({ game, orientation }: EvalBarProps) {
  const score = useStockfish(game);
  const whitePercent = whiteFillPercent(score);
  const whiteOnTop = orientation === "black";

  const whiteSegment = <div style={{ height: `${whitePercent}%` }} className="bg-[#e8e4d9]" />;
  const blackSegment = <div style={{ height: `${100 - whitePercent}%` }} className="bg-[#1a1a2e]" />;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-[480px] w-6 flex-col overflow-hidden rounded-md border border-secondary">
        {whiteOnTop ? whiteSegment : blackSegment}
        {whiteOnTop ? blackSegment : whiteSegment}
      </div>
      <span className="font-mono text-xs text-muted-foreground">{formatScore(score)}</span>
    </div>
  );
}
