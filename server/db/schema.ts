import { randomUUID } from "node:crypto";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// Squire's first schema (CHESS-009). Author here, then `drizzle-kit generate`
// + `drizzle-kit migrate` — never `drizzle-kit push` (unversioned + a known
// Turso table-recreation bug). See .claude/context/backend-engineer.md.
//
// Clerk is the identity source of truth: there is no `users` table. The Clerk
// user id (a string) is the `user_id` FK used directly, and every query filters
// on it (Squire's RLS equivalent).

// repertoires — a named tree of opening lines, scoped to one user and one side.
// Soft-deleted only (deleted_at) — the "never lose user data" rule lives here,
// at the repertoire level. Individual positions are NOT soft-deleted (see below).
export const repertoires = sqliteTable(
  "repertoires",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    // Which side this repertoire trains. A repertoire is for one colour.
    colour: text("colour", { enum: ["white", "black"] }).notNull(),
    // Stored as UTC instants (epoch-ms integers). SQLite has no timestamptz;
    // Date objects are inherently UTC, so one stored value serves every zone.
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("repertoires_user_id_idx").on(t.userId)],
);

// repertoire_positions — one node per saved half-move, forming a tree rooted at
// the standard starting position (parent_id NULL = a first move from startpos).
//
// Tree linkage is `parent_id` (a self-referencing FK), NOT `fen` — see
// "Non-obvious decisions" #14. A repertoire is a tree of *lines*, not a
// deduplicated graph of *positions*: a transposition (the same board reached by
// a different move order) is ordinary and must stay a separate node. A synthetic
// id has no ambiguity; matching on `fen` would the moment two rows share one.
// So `fen` is DESCRIPTIVE ONLY (board rendering, CHESS-010's initialFen) and
// carries NO uniqueness constraint — duplicate fens across rows are expected.
//
// Delete semantics (settled — Option A): NO `deleted_at` here. The parent_id FK
// carries ON DELETE CASCADE, so deleting a node removes its whole subtree in one
// operation, and deleting a repertoire (soft) hides its positions via the
// deleted_at IS NULL filter every position read applies to the parent repertoire.
//
// The SM-2 columns (ease_factor, interval, repetitions, next_due, last_reviewed)
// exist from this ticket but are left at defaults — CHESS-010/011 own the
// scheduling logic that writes them. next_due/last_reviewed are UTC instants.
export const repertoirePositions = sqliteTable(
  "repertoire_positions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    repertoireId: text("repertoire_id")
      .notNull()
      .references(() => repertoires.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    fen: text("fen").notNull(),
    // Stored in SAN (what chess.js emits, human-transcribable).
    move: text("move").notNull(),
    // Self-referencing tree edge. NULL = root move (from the start position).
    parentId: text("parent_id").references(
      (): AnySQLiteColumn => repertoirePositions.id,
      { onDelete: "cascade" },
    ),
    // SM-2 columns — created here, left at defaults; written by CHESS-010/011.
    easeFactor: real("ease_factor").notNull().default(2.5),
    interval: integer("interval").notNull().default(0),
    repetitions: integer("repetitions").notNull().default(0),
    nextDue: integer("next_due", { mode: "timestamp_ms" }),
    lastReviewed: integer("last_reviewed", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("repertoire_positions_user_id_idx").on(t.userId),
    index("repertoire_positions_repertoire_id_idx").on(t.repertoireId),
    index("repertoire_positions_parent_id_idx").on(t.parentId),
    // Blocks saving the identical move twice from the same node. NOTE: SQLite
    // treats NULLs as distinct in a UNIQUE index, so this does NOT catch two
    // duplicate ROOT moves (parent_id NULL) — the routes guard that case in
    // application code (find-or-merge on import, 409 on the save-move route).
    uniqueIndex("repertoire_positions_rep_parent_move_unique").on(
      t.repertoireId,
      t.parentId,
      t.move,
    ),
  ],
);

export type Repertoire = typeof repertoires.$inferSelect;
export type RepertoirePosition = typeof repertoirePositions.$inferSelect;
