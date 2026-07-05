import { z } from "zod";

// Skill level is the single source of truth for onboarding. It is stored in
// Clerk's publicMetadata.skillLevel — there is NO user_profiles table.
// See .claude/context/backend-engineer.md.
export const SKILL_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number];

// Body schema for PATCH /api/me/skill-level. .strict() rejects unexpected keys
// so a caller can't smuggle extra metadata through this route.
export const skillLevelBodySchema = z
  .object({
    skillLevel: z.enum(SKILL_LEVELS),
  })
  .strict();
