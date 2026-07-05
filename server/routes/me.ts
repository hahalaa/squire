import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { requireUser } from "../middleware/requireUser.js";
import { skillLevelBodySchema, type SkillLevel } from "../validation/me.js";

export const meRouter = Router();

// Every route here is behind requireUser (getAuth + 401), so req.userId is set.

// GET /api/me — the authenticated user's id and onboarding skill level.
// skillLevel is null until onboarding writes it to publicMetadata.
meRouter.get("/me", requireUser, async (req, res) => {
  const user = await clerkClient.users.getUser(req.userId!);
  const skillLevel = (user.publicMetadata.skillLevel as SkillLevel) ?? null;
  res.json({ data: { userId: req.userId, skillLevel }, error: null, meta: null });
});

// PATCH /api/me/skill-level — onboarding writes skillLevel to Clerk
// publicMetadata via the Backend API. No user_profiles table.
meRouter.patch("/me/skill-level", requireUser, async (req, res) => {
  const parsed = skillLevelBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: "Invalid skill level", meta: null });
    return;
  }

  const updated = await clerkClient.users.updateUserMetadata(req.userId!, {
    publicMetadata: { skillLevel: parsed.data.skillLevel },
  });

  res.json({
    data: { skillLevel: updated.publicMetadata.skillLevel },
    error: null,
    meta: null,
  });
});
