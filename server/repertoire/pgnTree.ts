import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";

// PGN <-> repertoire-tree conversion (variations <-> tree nodes).
//
// chess.js's loadPgn() flattens a game to its mainline and DISCARDS variations
// (verified against 1.4.0: history() drops any RAV), so it cannot build the
// tree we need. We tokenize the movetext ourselves and use chess.js only to
// validate each move's legality and derive the resulting FEN. See
// .claude/context/chess-domain.md — all move legality goes through chess.js,
// wrapped in try/catch (never trust a null return).

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// A tree node keyed by a synthetic id (the DB's tree edge is `parent_id`, never
// `fen` — #14). `fen` is the position AFTER `move`, descriptive only.
export interface TreeNode {
  id: string;
  move: string; // canonical SAN
  fen: string; // FEN after the move
  parentId: string | null; // null = root move (from the start position)
}

// buildForest is generic so callers can nest full DB rows (carrying the SM-2
// columns) into the tree, not just minimal TreeNodes.
export type WithChildren<T> = T & { children: WithChildren<T>[] };

// ---- PGN -> flat ordered node list (parents always precede their children) ----

// Strip headers, comments ({...} and ;... ), NAGs ($n); isolate ( ) as tokens.
function tokenizeMovetext(pgn: string): string[] {
  const movetext = pgn
    .replace(/^\s*\[[^\]]*\]\s*$/gm, "") // header tag-pairs
    .replace(/\{[^}]*\}/g, " ") // brace comments
    .replace(/;[^\n]*/g, " ") // line comments
    .replace(/\$\d+/g, " ") // NAGs
    .replace(/[()]/g, (m) => ` ${m} `); // space-pad parens

  return movetext.split(/\s+/).filter(Boolean);
}

const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

// Parse a PGN (headers optional; assumed to start from the standard position)
// into an ordered node list. Throws on the first illegal/malformed move so the
// import route can surface a 400.
export function pgnToTree(pgn: string): TreeNode[] {
  const tokens = tokenizeMovetext(pgn);
  const nodes: TreeNode[] = [];

  // Traversal state: the position + parent node the NEXT move descends from.
  let currentFen = START_FEN;
  let currentParent: string | null = null;
  // Branch point of the most recently played move: a `(` opens a variation that
  // is an alternative to that move, branching from the position BEFORE it.
  let branchFen = START_FEN;
  let branchParent: string | null = null;

  const stack: {
    resumeFen: string;
    resumeParent: string | null;
    branchFen: string;
    branchParent: string | null;
  }[] = [];

  for (const raw of tokens) {
    if (raw === "(") {
      stack.push({
        resumeFen: currentFen,
        resumeParent: currentParent,
        branchFen,
        branchParent,
      });
      // Enter the variation as a sibling of the last move.
      currentFen = branchFen;
      currentParent = branchParent;
      continue;
    }
    if (raw === ")") {
      const frame = stack.pop();
      if (!frame) throw new Error("Unbalanced ')' in PGN");
      currentFen = frame.resumeFen;
      currentParent = frame.resumeParent;
      branchFen = frame.branchFen;
      branchParent = frame.branchParent;
      continue;
    }

    // Strip a leading move number (`12.` / `12...`); a token may be only that.
    const token = raw.replace(/^\d+\.(\.\.)?/, "");
    if (!token || RESULTS.has(token)) continue;

    // Apply the move from the current position; chess.js is the legality oracle.
    const chess = new Chess(currentFen);
    let result;
    try {
      result = chess.move(token);
    } catch {
      throw new Error(`Illegal or unparseable move in PGN: "${token}"`);
    }

    const node: TreeNode = {
      id: randomUUID(),
      move: result.san,
      fen: result.after,
      parentId: currentParent,
    };
    nodes.push(node);

    // This move becomes the branch point for any variation that follows it.
    branchFen = currentFen;
    branchParent = currentParent;
    // Advance the mainline pointer onto the move just played.
    currentFen = result.after;
    currentParent = node.id;
  }

  if (stack.length > 0) throw new Error("Unbalanced '(' in PGN");
  return nodes;
}

// ---- flat node list -> forest (roots first, children in insertion order) ----

export function buildForest<T extends { id: string; parentId: string | null }>(
  nodes: T[],
): WithChildren<T>[] {
  const byId = new Map<string, WithChildren<T>>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });

  const roots: WithChildren<T>[] = [];
  for (const n of nodes) {
    const node = byId.get(n.id)!;
    const parent = n.parentId != null ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node); // parentId null, or a dangling parent (defensive)
  }
  return roots;
}

// ---- forest -> PGN movetext ----

// Rendering only needs the move label and children — accept any node shape.
interface RenderNode {
  move: string;
  children: RenderNode[];
}

function renderMove(node: RenderNode, ply: number, forceNumber: boolean): string {
  const moveNo = Math.ceil(ply / 2);
  const isWhite = ply % 2 === 1;
  if (isWhite) return `${moveNo}. ${node.move}`;
  return forceNumber ? `${moveNo}... ${node.move}` : node.move;
}

// Render the mainline descending from `parent`'s children. The first child is
// the mainline; the rest are variations (alternatives) emitted right after it.
function renderChildren(
  children: RenderNode[],
  parentPly: number,
  forceFirstNumber: boolean,
): string {
  if (children.length === 0) return "";
  const [main, ...alts] = children;
  const ply = parentPly + 1;

  const parts: string[] = [renderMove(main, ply, forceFirstNumber)];
  for (const alt of alts) {
    const varLine = renderVariation(alt, ply);
    parts.push(`( ${varLine} )`);
  }
  // A Black move directly after a variation is re-numbered for readability.
  const cont = renderChildren(main.children, ply, alts.length > 0);
  if (cont) parts.push(cont);
  return parts.join(" ");
}

function renderVariation(node: RenderNode, ply: number): string {
  const head = renderMove(node, ply, true);
  const cont = renderChildren(node.children, ply, false);
  return cont ? `${head} ${cont}` : head;
}

// Serialize a repertoire's positions to PGN. Multiple root moves become the
// mainline first move plus variations, via a virtual parent above ply 1.
export function treeToPgn(nodes: TreeNode[]): string {
  const roots = buildForest(nodes);
  const body = renderChildren(roots, 0, false);
  return body ? `${body} *` : "*";
}
