import type { PositionNode } from "./types";

// Pure view-model shaping for the repertoire tree browser. Kept free of React so
// it can be unit-tested directly (Vitest, node env) per the always-on testing
// rule — the collapsible browser renders straight from these outputs.

// A human move label ("1. e4", "1... e5", "2. Nf3") for a node.
//
// The mover's side is read AUTHORITATIVELY from the position's own FEN — its
// active-colour field (whose move it is *after* this move) and its fullmove
// number — NEVER inferred from the node's depth or index in the tree. Inferring
// side from tree position is exactly the index-parity mistake CHESS-005 was
// bitten by (see .claude/context/frontend-engineer.md): a Black-repertoire line
// or any position can break parity assumptions, but the FEN never lies.
export function moveLabel(fen: string, san: string): string {
  const fields = fen.split(" ");
  const active = fields[1]; // side to move AFTER this move
  const fullmove = Number(fields[5]); // fullmove counter AFTER this move
  // The move that produced this FEN was played by the side NOT now to move.
  const moverIsWhite = active === "b";
  const number = moverIsWhite ? fullmove : fullmove - 1;
  // Defensive: a malformed FEN (shouldn't happen — these come from chess.js
  // server-side) falls back to the bare move rather than rendering "NaN. e4".
  if (!Number.isFinite(number)) return san;
  return moverIsWhite ? `${number}. ${san}` : `${number}... ${san}`;
}

// A single row in the flattened, currently-visible view of the tree. The
// browser renders a flat list and indents by `depth`, rather than recursing in
// JSX — this keeps the collapse/expand logic pure and testable.
export interface TreeRow {
  node: PositionNode;
  depth: number; // 0 = a root move
  hasChildren: boolean;
  isExpanded: boolean;
  // A node that is not the first child of its parent is an alternative line (a
  // variation), not the mainline — the browser marks these visually.
  isVariation: boolean;
}

// Flatten the forest into the ordered list of rows currently visible given the
// set of expanded node ids. A collapsed node contributes its own row but none
// of its descendants. Depth-first, preserving sibling order (mainline first).
export function flattenVisible(
  tree: PositionNode[],
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (nodes: PositionNode[], depth: number) => {
    nodes.forEach((node, index) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = expanded.has(node.id);
      rows.push({
        node,
        depth,
        hasChildren,
        isExpanded,
        isVariation: index > 0,
      });
      if (hasChildren && isExpanded) walk(node.children, depth + 1);
    });
  };
  walk(tree, 0);
  return rows;
}

// Every node id in the forest — used to seed an "expand all" default so a
// freshly-loaded tree shows its full shape rather than only the roots.
export function allNodeIds(tree: PositionNode[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: PositionNode[]) => {
    for (const node of nodes) {
      ids.push(node.id);
      walk(node.children);
    }
  };
  walk(tree);
  return ids;
}
