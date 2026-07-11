import { Router } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Chess } from "chess.js";

import { db } from "../db/index.js";
import {
  repertoires,
  repertoirePositions,
  type RepertoirePosition,
} from "../db/schema.js";
import { requireUser } from "../middleware/requireUser.js";
import {
  createPositionSchema,
  createRepertoireSchema,
  idParamSchema,
  importPgnSchema,
  positionParamsSchema,
  updatePositionSchema,
  updateRepertoireSchema,
} from "../validation/repertoire.js";
import {
  buildForest,
  pgnToTree,
  START_FEN,
  treeToPgn,
} from "../repertoire/pgnTree.js";

export const repertoireRouter = Router();

// Every route is behind requireUser (getAuth + 401), so req.userId is set, and
// every query filters on it — a user can never read/patch/delete another user's
// repertoire or positions. See .claude/context/backend-engineer.md.

// ---- shared helpers ----

// Fetch a live (non-soft-deleted) repertoire owned by this user, or null.
async function findRepertoire(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(repertoires)
    .where(
      and(
        eq(repertoires.id, id),
        eq(repertoires.userId, userId),
        isNull(repertoires.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

// A single position within a repertoire, scoped to the user.
async function findPosition(
  repertoireId: string,
  userId: string,
  positionId: string,
) {
  const [row] = await db
    .select()
    .from(repertoirePositions)
    .where(
      and(
        eq(repertoirePositions.id, positionId),
        eq(repertoirePositions.repertoireId, repertoireId),
        eq(repertoirePositions.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// The existing sibling with the same move under the same parent, if any. Handles
// the parent_id NULL (root) case the UNIQUE index can't catch on its own.
async function findSibling(
  repertoireId: string,
  userId: string,
  parentId: string | null,
  move: string,
) {
  const [row] = await db
    .select()
    .from(repertoirePositions)
    .where(
      and(
        eq(repertoirePositions.repertoireId, repertoireId),
        eq(repertoirePositions.userId, userId),
        parentId === null
          ? isNull(repertoirePositions.parentId)
          : eq(repertoirePositions.parentId, parentId),
        eq(repertoirePositions.move, move),
      ),
    )
    .limit(1);
  return row ?? null;
}

// All positions in a repertoire, in insertion order (rowid) so the first-saved
// child of a node is the mainline on export.
function listPositions(repertoireId: string, userId: string) {
  return db
    .select()
    .from(repertoirePositions)
    .where(
      and(
        eq(repertoirePositions.repertoireId, repertoireId),
        eq(repertoirePositions.userId, userId),
      ),
    )
    .orderBy(sql`rowid`);
}

// Validate + canonicalise a SAN move against the parent position. chess.js is
// the legality oracle (throws on illegal/malformed — never trust a null return).
function deriveMove(parentFen: string, san: string) {
  const chess = new Chess(parentFen);
  const m = chess.move(san); // throws on illegal
  return { fen: m.after, san: m.san };
}

// Whether a position has any child (a continuation) — used to keep move-edits
// restricted to leaf nodes so no subtree is orphaned.
async function hasChildren(positionId: string, userId: string) {
  const [row] = await db
    .select({ id: repertoirePositions.id })
    .from(repertoirePositions)
    .where(
      and(
        eq(repertoirePositions.parentId, positionId),
        eq(repertoirePositions.userId, userId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// ---- repertoire CRUD ----

// GET /api/repertoires — the user's live repertoires (no positions).
repertoireRouter.get("/repertoires", requireUser, async (req, res) => {
  const rows = await db
    .select()
    .from(repertoires)
    .where(
      and(
        eq(repertoires.userId, req.userId!),
        isNull(repertoires.deletedAt),
      ),
    )
    .orderBy(sql`rowid`);
  res.json({ data: rows, error: null, meta: null });
});

// POST /api/repertoires — create a named, single-colour repertoire.
repertoireRouter.post("/repertoires", requireUser, async (req, res) => {
  const parsed = createRepertoireSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ data: null, error: "Invalid repertoire", meta: null });
    return;
  }
  const [row] = await db
    .insert(repertoires)
    .values({
      userId: req.userId!,
      name: parsed.data.name,
      colour: parsed.data.colour,
    })
    .returning();
  res.status(201).json({ data: row, error: null, meta: null });
});

// GET /api/repertoires/:id — repertoire + its positions (flat) + tree (nested).
repertoireRouter.get("/repertoires/:id", requireUser, async (req, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    res
      .status(400)
      .json({ data: null, error: "Invalid repertoire id", meta: null });
    return;
  }
  const rep = await findRepertoire(req.userId!, params.data.id);
  if (!rep) {
    res
      .status(404)
      .json({ data: null, error: "Repertoire not found", meta: null });
    return;
  }
  const positions = await listPositions(rep.id, req.userId!);
  res.json({
    data: { ...rep, positions, tree: buildForest(positions) },
    error: null,
    meta: null,
  });
});

// PATCH /api/repertoires/:id — rename and/or change colour.
repertoireRouter.patch("/repertoires/:id", requireUser, async (req, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    res
      .status(400)
      .json({ data: null, error: "Invalid repertoire id", meta: null });
    return;
  }
  const parsed = updateRepertoireSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ data: null, error: "Invalid repertoire update", meta: null });
    return;
  }
  const rep = await findRepertoire(req.userId!, params.data.id);
  if (!rep) {
    res
      .status(404)
      .json({ data: null, error: "Repertoire not found", meta: null });
    return;
  }
  const [row] = await db
    .update(repertoires)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.colour !== undefined
        ? { colour: parsed.data.colour }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(repertoires.id, rep.id), eq(repertoires.userId, req.userId!)),
    )
    .returning();
  res.json({ data: row, error: null, meta: null });
});

// DELETE /api/repertoires/:id — SOFT delete (deleted_at). Positions stay in the
// table but are hidden by the deleted_at IS NULL filter every read applies.
repertoireRouter.delete("/repertoires/:id", requireUser, async (req, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    res
      .status(400)
      .json({ data: null, error: "Invalid repertoire id", meta: null });
    return;
  }
  const rep = await findRepertoire(req.userId!, params.data.id);
  if (!rep) {
    res
      .status(404)
      .json({ data: null, error: "Repertoire not found", meta: null });
    return;
  }
  await db
    .update(repertoires)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(repertoires.id, rep.id), eq(repertoires.userId, req.userId!)),
    );
  res.json({ data: { id: rep.id, deleted: true }, error: null, meta: null });
});

// ---- positions ----

// POST /api/repertoires/:id/positions — "save this move". Body: { move, parentId? }.
// The resulting FEN is derived server-side from the parent position; a
// client-supplied FEN is never trusted.
repertoireRouter.post(
  "/repertoires/:id/positions",
  requireUser,
  async (req, res) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      res
        .status(400)
        .json({ data: null, error: "Invalid repertoire id", meta: null });
      return;
    }
    const parsed = createPositionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: "Invalid move", meta: null });
      return;
    }
    const rep = await findRepertoire(req.userId!, params.data.id);
    if (!rep) {
      res
        .status(404)
        .json({ data: null, error: "Repertoire not found", meta: null });
      return;
    }

    const parentId = parsed.data.parentId ?? null;
    let parentFen = START_FEN;
    if (parentId !== null) {
      const parent = await findPosition(rep.id, req.userId!, parentId);
      if (!parent) {
        res
          .status(404)
          .json({ data: null, error: "Parent position not found", meta: null });
        return;
      }
      parentFen = parent.fen;
    }

    let derived;
    try {
      derived = deriveMove(parentFen, parsed.data.move);
    } catch {
      res
        .status(400)
        .json({ data: null, error: "Illegal move for this position", meta: null });
      return;
    }

    const existing = await findSibling(
      rep.id,
      req.userId!,
      parentId,
      derived.san,
    );
    if (existing) {
      res.status(409).json({
        data: null,
        error: "That move is already saved from this position",
        meta: null,
      });
      return;
    }

    const [row] = await db
      .insert(repertoirePositions)
      .values({
        repertoireId: rep.id,
        userId: req.userId!,
        fen: derived.fen,
        move: derived.san,
        parentId,
      })
      .returning();
    res.status(201).json({ data: row, error: null, meta: null });
  },
);

// PATCH /api/repertoires/:id/positions/:positionId — correct a LEAF node's move
// (re-deriving its FEN). Rejected on a node with continuations, so no subtree is
// orphaned. SM-2 scheduling fields are deliberately NOT writable here — CHESS-011
// owns scheduling writes (the frontend never computes scheduling).
repertoireRouter.patch(
  "/repertoires/:id/positions/:positionId",
  requireUser,
  async (req, res) => {
    const params = positionParamsSchema.safeParse(req.params);
    if (!params.success) {
      res
        .status(400)
        .json({ data: null, error: "Invalid position id", meta: null });
      return;
    }
    const parsed = updatePositionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: "Invalid move", meta: null });
      return;
    }
    const rep = await findRepertoire(req.userId!, params.data.id);
    if (!rep) {
      res
        .status(404)
        .json({ data: null, error: "Repertoire not found", meta: null });
      return;
    }
    const pos = await findPosition(
      rep.id,
      req.userId!,
      params.data.positionId,
    );
    if (!pos) {
      res
        .status(404)
        .json({ data: null, error: "Position not found", meta: null });
      return;
    }
    if (await hasChildren(pos.id, req.userId!)) {
      res.status(409).json({
        data: null,
        error:
          "Cannot edit a move that has continuations; delete them first",
        meta: null,
      });
      return;
    }

    let parentFen = START_FEN;
    if (pos.parentId !== null) {
      const parent = await findPosition(rep.id, req.userId!, pos.parentId);
      if (!parent) {
        res
          .status(404)
          .json({ data: null, error: "Parent position not found", meta: null });
        return;
      }
      parentFen = parent.fen;
    }

    let derived;
    try {
      derived = deriveMove(parentFen, parsed.data.move);
    } catch {
      res
        .status(400)
        .json({ data: null, error: "Illegal move for this position", meta: null });
      return;
    }

    const existing = await findSibling(
      rep.id,
      req.userId!,
      pos.parentId,
      derived.san,
    );
    if (existing && existing.id !== pos.id) {
      res.status(409).json({
        data: null,
        error: "That move is already saved from this position",
        meta: null,
      });
      return;
    }

    const [row] = await db
      .update(repertoirePositions)
      .set({ move: derived.san, fen: derived.fen })
      .where(
        and(
          eq(repertoirePositions.id, pos.id),
          eq(repertoirePositions.userId, req.userId!),
        ),
      )
      .returning();
    res.json({ data: row, error: null, meta: null });
  },
);

// DELETE /api/repertoires/:id/positions/:positionId — hard-delete the node; the
// ON DELETE CASCADE on parent_id removes its whole subtree in one operation.
repertoireRouter.delete(
  "/repertoires/:id/positions/:positionId",
  requireUser,
  async (req, res) => {
    const params = positionParamsSchema.safeParse(req.params);
    if (!params.success) {
      res
        .status(400)
        .json({ data: null, error: "Invalid position id", meta: null });
      return;
    }
    const rep = await findRepertoire(req.userId!, params.data.id);
    if (!rep) {
      res
        .status(404)
        .json({ data: null, error: "Repertoire not found", meta: null });
      return;
    }
    const pos = await findPosition(
      rep.id,
      req.userId!,
      params.data.positionId,
    );
    if (!pos) {
      res
        .status(404)
        .json({ data: null, error: "Position not found", meta: null });
      return;
    }
    await db
      .delete(repertoirePositions)
      .where(
        and(
          eq(repertoirePositions.id, pos.id),
          eq(repertoirePositions.userId, req.userId!),
        ),
      );
    res.json({ data: { id: pos.id, deleted: true }, error: null, meta: null });
  },
);

// ---- PGN import / export (dedicated routes; a documented deviation from the
// appendix routes table, which lists only the 4 CRUD paths for CHESS-009) ----

// POST /api/repertoires/:id/import — append a PGN's lines to the tree, MERGING:
// a (parent, move) that already exists is reused rather than duplicated, so
// re-importing is non-destructive and transpositions of a *line* collapse
// correctly while transpositions of a *position* stay distinct nodes (#14).
repertoireRouter.post(
  "/repertoires/:id/import",
  requireUser,
  async (req, res) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      res
        .status(400)
        .json({ data: null, error: "Invalid repertoire id", meta: null });
      return;
    }
    const parsed = importPgnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: "Invalid PGN body", meta: null });
      return;
    }
    const rep = await findRepertoire(req.userId!, params.data.id);
    if (!rep) {
      res
        .status(404)
        .json({ data: null, error: "Repertoire not found", meta: null });
      return;
    }

    let nodes;
    try {
      nodes = pgnToTree(parsed.data.pgn);
    } catch {
      res
        .status(400)
        .json({ data: null, error: "Could not parse PGN", meta: null });
      return;
    }

    // Multi-step write → one transaction (backend-engineer.md). Parse order
    // guarantees a parent is inserted before its children, satisfying the FK.
    const { inserted, merged } = await db.transaction(async (tx) => {
      const idMap = new Map<string, string>(); // parsed id -> db id
      let inserted = 0;
      let merged = 0;
      for (const node of nodes) {
        const dbParentId =
          node.parentId !== null ? idMap.get(node.parentId)! : null;

        const [existing] = await tx
          .select()
          .from(repertoirePositions)
          .where(
            and(
              eq(repertoirePositions.repertoireId, rep.id),
              eq(repertoirePositions.userId, req.userId!),
              dbParentId === null
                ? isNull(repertoirePositions.parentId)
                : eq(repertoirePositions.parentId, dbParentId),
              eq(repertoirePositions.move, node.move),
            ),
          )
          .limit(1);

        if (existing) {
          idMap.set(node.id, existing.id);
          merged++;
          continue;
        }
        const [row] = await tx
          .insert(repertoirePositions)
          .values({
            repertoireId: rep.id,
            userId: req.userId!,
            fen: node.fen,
            move: node.move,
            parentId: dbParentId,
          })
          .returning();
        idMap.set(node.id, row.id);
        inserted++;
      }
      return { inserted, merged };
    });

    const positions = await listPositions(rep.id, req.userId!);
    res.json({
      data: { ...rep, positions, tree: buildForest(positions) },
      error: null,
      meta: { inserted, merged },
    });
  },
);

// GET /api/repertoires/:id/export — the repertoire's tree serialized to PGN,
// returned as a downloadable text/plain body (not the JSON envelope; errors
// still use the JSON envelope).
repertoireRouter.get(
  "/repertoires/:id/export",
  requireUser,
  async (req, res) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) {
      res
        .status(400)
        .json({ data: null, error: "Invalid repertoire id", meta: null });
      return;
    }
    const rep = await findRepertoire(req.userId!, params.data.id);
    if (!rep) {
      res
        .status(404)
        .json({ data: null, error: "Repertoire not found", meta: null });
      return;
    }
    const positions: RepertoirePosition[] = await listPositions(
      rep.id,
      req.userId!,
    );
    const movetext = treeToPgn(positions);

    // Strip quotes/newlines from user text before it enters a PGN tag value.
    const safeName = rep.name.replace(/["\r\n]/g, "").slice(0, 100);
    const header =
      `[Event "Squire repertoire: ${safeName}"]\n` +
      `[Site "Squire"]\n` +
      `[Result "*"]\n\n`;
    const filename =
      rep.name.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 60) || "repertoire";

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.pgn"`,
    );
    res.send(`${header}${movetext}\n`);
  },
);
