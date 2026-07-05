import { useState } from "react";
import { useUser } from "@clerk/react";
import { useApi } from "@/lib/api";

// Skill levels — kept in sync with the backend enum in server/validation/me.ts
// (the single source of truth is Clerk publicMetadata.skillLevel; there is no
// user_profiles table).
const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner", blurb: "Learning how the pieces move and basic tactics." },
  { value: "intermediate", label: "Intermediate", blurb: "Comfortable with tactics; building opening and endgame knowledge." },
  { value: "advanced", label: "Advanced", blurb: "Strong club player refining strategy and preparation." },
  { value: "expert", label: "Expert", blurb: "Tournament-strength; sharpening the finer points." },
] as const;

type SkillLevel = (typeof SKILL_LEVELS)[number]["value"];

// Shown once, right after sign-up, when publicMetadata.skillLevel is unset.
// Writes the choice through the backend (which calls the Clerk Backend API),
// then reloads the Clerk user so the app re-renders past this gate.
export function Onboarding() {
  const { user } = useUser();
  const api = useApi();
  const [submitting, setSubmitting] = useState<SkillLevel | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(skillLevel: SkillLevel) {
    setSubmitting(skillLevel);
    setError(null);
    const res = await api("/api/me/skill-level", {
      method: "PATCH",
      body: JSON.stringify({ skillLevel }),
    });
    if (res.error) {
      setError("Could not save your skill level. Please try again.");
      setSubmitting(null);
      return;
    }
    // Refresh the cached Clerk user so publicMetadata.skillLevel is now set and
    // AuthedApp renders the app instead of this onboarding step.
    await user?.reload();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-display text-3xl font-bold text-primary">
          Welcome to Squire
        </h1>
        <p className="max-w-md text-muted-foreground">
          How would you describe your chess level? This tailors the coaching to you.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        {SKILL_LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            disabled={submitting !== null}
            onClick={() => choose(level.value)}
            className="rounded-lg border border-secondary p-4 text-left transition-colors hover:border-primary disabled:opacity-50"
          >
            <div className="font-display font-semibold text-primary">
              {level.label}
              {submitting === level.value ? " …" : ""}
            </div>
            <div className="text-sm text-muted-foreground">{level.blurb}</div>
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </main>
  );
}
