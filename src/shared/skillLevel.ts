import { useUser } from "@clerk/react";

// Kept in sync with the backend enum in server/validation/me.ts — the single
// source of truth is Clerk publicMetadata.skillLevel; there is no
// user_profiles table on either side of the stack.
export const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number];

const DEFAULT_SKILL_LEVEL: SkillLevel = "intermediate";

function isSkillLevel(value: unknown): value is SkillLevel {
  return typeof value === "string" && (SKILL_LEVELS as readonly string[]).includes(value);
}

/**
 * Effective skill level for gating/config purposes (concept-detector
 * visibility, endgame generator complexity, coaching preambles), defaulting
 * to 'intermediate' when unset. NOT for the onboarding gate — that check
 * needs the raw undefined-or-not value from Clerk directly, since defaulting
 * here would make onboarding un-skippable-to.
 */
export function useSkillLevel(): SkillLevel {
  const { user } = useUser();
  const raw = user?.publicMetadata.skillLevel;
  return isSkillLevel(raw) ? raw : DEFAULT_SKILL_LEVEL;
}
