import { useState } from "react";
import { SignIn, SignUp } from "@clerk/react";

// Sign-in / sign-up gate for unauthenticated visitors. Clerk's prebuilt
// components render the Google / Facebook / Discord social buttons (enabled in
// the Clerk dashboard) plus the email/password fallback. There is no router in
// the app yet, so we toggle between the two flows with local state and use
// hash routing, which Clerk supports for standalone mounting.
export function SignedOutView() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-display text-4xl font-bold text-primary">Squire</h1>
        <p className="max-w-md text-muted-foreground">
          AI-powered chess coaching. Sign in to start training.
        </p>
      </div>

      {mode === "sign-in" ? (
        <SignIn routing="hash" />
      ) : (
        <SignUp routing="hash" />
      )}

      <button
        type="button"
        onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
      >
        {mode === "sign-in"
          ? "Need an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </main>
  );
}
