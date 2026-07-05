import { Show } from "@clerk/react";
import { SignedOutView } from "@/auth/SignedOutView";
import { AuthedApp } from "@/auth/AuthedApp";

// Auth gating uses Clerk's <Show when="signed-in"> / <Show when="signed-out">.
// The old <SignedIn>/<SignedOut>/<Protect> components are removed exports as of
// @clerk/react v6 (Core 3) — do not use them. See .claude/context/frontend-engineer.md.
function App() {
  return (
    <>
      <Show when="signed-out">
        <SignedOutView />
      </Show>
      <Show when="signed-in">
        <AuthedApp />
      </Show>
    </>
  );
}

export default App;
