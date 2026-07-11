import { z } from "zod";

// Zod schemas for the repertoire CRUD + import/export surface (CHESS-009).
// Every route validates its body/params through one of these before touching
// Drizzle or chess.js (see .claude/context/security-reviewer.md). Move legality
// itself is NOT checked here — that is delegated to chess.js in the route,
// against the authoritative parent position (mirrors validation/opening.ts).

const colour = z.enum(["white", "black"]);

// A repertoire name: trimmed, non-empty, bounded.
const name = z.string().trim().min(1).max(100);

export const createRepertoireSchema = z
  .object({ name, colour })
  .strict();

export const updateRepertoireSchema = z
  .object({ name: name.optional(), colour: colour.optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.colour !== undefined, {
    message: "Provide at least one of name or colour",
  });

// A single saved move ("save this move"). `move` is SAN — kept short and
// non-empty; its legality from the parent position is validated in the route.
// `parentId` null/absent means a root move (from the standard start position).
export const createPositionSchema = z
  .object({
    move: z.string().trim().min(1).max(12),
    parentId: z.string().uuid().nullish(),
  })
  .strict();

// Editing a position in CHESS-009 supports correcting its `move` only (the
// route restricts this to leaf nodes so no subtree is orphaned). SM-2 columns
// exist but are NOT writable here — CHESS-011 owns scheduling writes, and the
// frontend never computes scheduling.
export const updatePositionSchema = z
  .object({ move: z.string().trim().min(1).max(12) })
  .strict();

// PGN import body. Capped well below the 1mb JSON body limit; this is a JSON
// field, not a file upload, so the security-reviewer .pgn-extension/500KB
// file-upload rule (CHESS-022's game import) does not apply here.
export const importPgnSchema = z
  .object({ pgn: z.string().min(1).max(200_000) })
  .strict();

// Route :id / :positionId params.
export const idParamSchema = z.object({ id: z.string().uuid() });
export const positionParamsSchema = z.object({
  id: z.string().uuid(),
  positionId: z.string().uuid(),
});

export type CreateRepertoireBody = z.infer<typeof createRepertoireSchema>;
export type Colour = z.infer<typeof colour>;
