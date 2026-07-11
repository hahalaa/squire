// Frontend mirror of the CHESS-009 Phase 1 API contract (a FIXED contract — the
// backend is committed and not modified this ticket). See
// .claude/completed/CHESS-009-overview.md "Response contracts" / "Routes".

// GET /api/repertoires returns a list of these (no positions).
export interface RepertoireSummary {
  id: string;
  userId: string;
  name: string;
  colour: "white" | "black";
  // timestamp_ms columns serialize to ISO strings over JSON; nullable deletedAt.
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// A node in the nested `tree` GET /api/repertoires/:id returns (the backend's
// buildForest output): the position row plus a `children` array. Roots come
// first and each node's children are in insertion order, so `children[0]` is
// the mainline and any siblings after it are variations. `fen` is the position
// AFTER `move` and is descriptive only (tree edges are `parentId`, never `fen`
// — see #14). The SM-2 columns are present in the payload but unused here.
export interface PositionNode {
  id: string;
  repertoireId: string;
  userId: string;
  fen: string;
  move: string; // SAN
  parentId: string | null;
  children: PositionNode[];
}

// GET /api/repertoires/:id — the repertoire fields plus the flat `positions`
// list (unused by the browser, which consumes `tree`) and the nested `tree`.
export interface RepertoireDetail extends RepertoireSummary {
  positions: unknown[];
  tree: PositionNode[];
}

// POST /api/repertoires/:id/import returns the refreshed detail in `data` and
// { inserted, merged } in `meta`.
export interface ImportMeta {
  inserted: number;
  merged: number;
}
