import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PendingPromotion, PromotionPiece } from "@/board/useGameState";

const PROMOTION_CHOICES: { piece: PromotionPiece; label: string }[] = [
  { piece: "q", label: "Queen" },
  { piece: "r", label: "Rook" },
  { piece: "b", label: "Bishop" },
  { piece: "n", label: "Knight" },
];

// react-chessboard 5.10.0 ships no promotion dialog API (no onPromotionCheck /
// onPromotionPieceSelect prop exists on ChessboardOptions) — this is a
// hand-built replacement. See CHESS-005 session overview.
const GLYPHS: Record<"w" | "b", Record<PromotionPiece, string>> = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};

interface PromotionDialogProps {
  pending: PendingPromotion | null;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

export function PromotionDialog({ pending, onSelect, onCancel }: PromotionDialogProps) {
  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-display text-primary">Promote pawn to</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          {pending &&
            PROMOTION_CHOICES.map(({ piece, label }) => (
              <Button
                key={piece}
                variant="outline"
                className="flex h-16 flex-col gap-1 text-3xl"
                aria-label={label}
                onClick={() => onSelect(piece)}
              >
                <span>{GLYPHS[pending.color][piece]}</span>
              </Button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
