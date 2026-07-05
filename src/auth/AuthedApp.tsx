import { useUser, UserButton } from "@clerk/react";
import { Onboarding } from "@/auth/Onboarding";
import { BoardView } from "@/board/BoardView";
import { useChessGame } from "@/board/useChessGame";

// Rendered for signed-in users. Reads skill level from Clerk publicMetadata
// (no separate profile fetch, no user_profiles table). Until onboarding sets
// it, the onboarding step is shown instead of the app.
export function AuthedApp() {
  const { isLoaded, user } = useUser();
  // useChessGame() is called once here (not inside BoardView) so CHESS-006's
  // eval bar can be added as a sibling of BoardView sharing this same
  // instance, instead of creating an independent, driftable chess.js game.
  const game = useChessGame();

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const skillLevel = user?.publicMetadata.skillLevel as string | undefined;

  if (!skillLevel) {
    return <Onboarding />;
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-secondary p-4">
        <span className="font-display text-xl font-bold text-primary">Squire</span>
        <UserButton />
      </header>
      <main className="flex flex-col items-center gap-6 p-8">
        <BoardView game={game} />
      </main>
    </div>
  );
}
