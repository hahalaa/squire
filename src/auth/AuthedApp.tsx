import { useUser, UserButton } from "@clerk/react";
import { NavLink, Route, Routes } from "react-router-dom";
import { Onboarding } from "@/auth/Onboarding";
import { PlayView } from "@/board/PlayView";
import { RepertoireBrowser } from "@/repertoire/RepertoireBrowser";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";

// Rendered for signed-in users. Reads skill level from Clerk publicMetadata
// (no separate profile fetch, no user_profiles table). Until onboarding sets
// it, the onboarding step is shown instead of the app. This is the authed
// shell: a header with view navigation plus the routed views (routing added at
// CHESS-009 Phase 2 to surface the repertoire browser alongside free play).
export function AuthedApp() {
  const { isLoaded, user } = useUser();

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
        <div className="flex items-center gap-6">
          <span className="font-display text-xl font-bold text-primary">Squire</span>
          <nav className="flex gap-1">
            <NavItem to="/">Play</NavItem>
            <NavItem to="/repertoires">Repertoires</NavItem>
          </nav>
        </div>
        <UserButton />
      </header>
      <main className="p-4 sm:p-8">
        <Routes>
          <Route
            path="/"
            element={
              <div className="flex justify-center">
                <PlayView />
              </div>
            }
          />
          <Route
            path="/repertoires"
            element={
              <ErrorBoundary label="The repertoire browser hit an error">
                <RepertoireBrowser />
              </ErrorBoundary>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      // `end` so "/" isn't marked active while on /repertoires.
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}
