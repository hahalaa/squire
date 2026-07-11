import { useState } from "react";
import { BoardView } from "@/board/BoardView";
import { useGameState } from "@/board/useGameState";

// The free-play board view (the "/" route). Owns the game state and board
// orientation — extracted from AuthedApp unchanged when routing was introduced
// at CHESS-009 Phase 2. useGameState() is still called exactly once here (not
// inside BoardView) so EvalBar can share this same instance; orientation stays
// a separate view-only concern, not part of GameState. Navigating away and back
// resets free-play state — an accepted tradeoff of route-based navigation.
export function PlayView() {
  const game = useGameState();
  const [orientation, setOrientation] = useState<"white" | "black">("white");

  return (
    <BoardView
      game={game}
      orientation={orientation}
      onFlipOrientation={() =>
        setOrientation((o) => (o === "white" ? "black" : "white"))
      }
    />
  );
}
