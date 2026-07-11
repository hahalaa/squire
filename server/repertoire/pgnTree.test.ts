import { describe, it, expect } from "vitest";
import {
  pgnToTree,
  treeToPgn,
  buildForest,
  START_FEN,
  type TreeNode,
} from "./pgnTree.js";

// Structural signature of a tree: the sorted set of root-to-leaf SAN paths.
// Ids are synthetic (random), so we compare shape, not ids.
function leafPaths(nodes: TreeNode[]): string[] {
  const forest = buildForest(nodes);
  const paths: string[] = [];
  const walk = (n: (typeof forest)[number], prefix: string[]) => {
    const p = [...prefix, n.move];
    if (n.children.length === 0) paths.push(p.join(" "));
    n.children.forEach((c) => walk(c, p));
  };
  forest.forEach((r) => walk(r, []));
  return paths.sort();
}

describe("pgnToTree", () => {
  it("parses a linear mainline into a parent-linked chain", () => {
    const nodes = pgnToTree("1. e4 e5 2. Nf3 Nc6 3. Bb5");
    expect(nodes.map((n) => n.move)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
    // First move is a root; each later move's parent is the previous node.
    expect(nodes[0].parentId).toBeNull();
    expect(nodes[1].parentId).toBe(nodes[0].id);
    expect(nodes[4].parentId).toBe(nodes[3].id);
  });

  it("stores the FEN after each move (descriptive) — not the start position", () => {
    const [e4] = pgnToTree("1. e4");
    expect(e4.fen).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    );
    expect(e4.fen).not.toBe(START_FEN);
  });

  it("maps a variation to a sibling branching from the same parent", () => {
    // 1... c5 is an alternative to 1... e5, so both branch from the e4 node.
    const nodes = pgnToTree("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6");
    const e4 = nodes.find((n) => n.move === "e4")!;
    const e5 = nodes.find((n) => n.move === "e5")!;
    const c5 = nodes.find((n) => n.move === "c5")!;
    expect(e5.parentId).toBe(e4.id);
    expect(c5.parentId).toBe(e4.id); // sibling of e5
    // The variation's Nf3 hangs off c5, the mainline's Nf3 hangs off e5.
    const nf3UnderC5 = nodes.find((n) => n.move === "Nf3" && n.parentId === c5.id);
    const nf3UnderE5 = nodes.find((n) => n.move === "Nf3" && n.parentId === e5.id);
    expect(nf3UnderC5).toBeDefined();
    expect(nf3UnderE5).toBeDefined();
  });

  it("keeps a transposition as two distinct nodes with the same FEN (#14)", () => {
    // Both lines reach the identical board (a King's Indian Attack setup) by a
    // different move order — a genuine transposition to byte-identical FENs.
    const nodes = pgnToTree("1. Nf3 (1. g3 Nf6 2. Nf3 g6) 1... Nf6 2. g3 g6");
    const leaves = nodes.filter(
      (n) => !nodes.some((c) => c.parentId === n.id),
    );
    // Two separate leaf nodes...
    expect(leaves).toHaveLength(2);
    // ...that are genuinely the same board position (transposition)...
    expect(leaves[0].fen).toBe(leaves[1].fen);
    // ...but remain distinct nodes, never merged.
    expect(leaves[0].id).not.toBe(leaves[1].id);
  });

  it("handles multiple root moves (alternatives at move 1)", () => {
    const nodes = pgnToTree("1. e4 (1. d4 d5) (1. c4) 1... e5");
    const roots = nodes.filter((n) => n.parentId === null);
    expect(roots.map((n) => n.move).sort()).toEqual(["c4", "d4", "e4"]);
  });

  it("ignores comments, NAGs, and result tokens", () => {
    const nodes = pgnToTree(
      "1. e4 {best by test} e5 $1 2. Nf3 ; a comment\nNc6 1-0",
    );
    expect(nodes.map((n) => n.move)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("ignores PGN header tag-pairs", () => {
    const nodes = pgnToTree('[Event "x"]\n[White "y"]\n\n1. e4 e5');
    expect(nodes.map((n) => n.move)).toEqual(["e4", "e5"]);
  });

  it("throws on an illegal move (chess.js is the oracle)", () => {
    expect(() => pgnToTree("1. e4 e5 2. Ke2 Qh4 3. Zz9")).toThrow();
  });

  it("throws on unbalanced parentheses", () => {
    expect(() => pgnToTree("1. e4 e5 (1... c5")).toThrow(/Unbalanced/);
    expect(() => pgnToTree("1. e4 e5 )")).toThrow(/Unbalanced/);
  });

  it("returns an empty list for empty movetext", () => {
    expect(pgnToTree("*")).toEqual([]);
    expect(pgnToTree('[Event "x"]\n\n*')).toEqual([]);
  });
});

describe("treeToPgn", () => {
  it("serializes a mainline with a trailing result", () => {
    const nodes = pgnToTree("1. e4 e5 2. Nf3 Nc6");
    expect(treeToPgn(nodes)).toBe("1. e4 e5 2. Nf3 Nc6 *");
  });

  it("serializes an empty tree as just a result", () => {
    expect(treeToPgn([])).toBe("*");
  });
});

describe("round-trip pgnToTree -> treeToPgn -> pgnToTree", () => {
  const cases = [
    "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6",
    "1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 (2... Nf6 3. Nxe5)",
    "1. e4 (1. d4 d5 2. c4) (1. c4 e5) 1... e5 2. Nf3 Nc6",
    "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 (3... d5 4. Nf3 Be7) 4. e3 O-O",
    "1. Nf3 (1. g3 Nf6 2. Nf3 g6) 1... Nf6 2. g3 g6", // transposition
  ];

  for (const pgn of cases) {
    it(`preserves structure: ${pgn}`, () => {
      const first = pgnToTree(pgn);
      const reparsed = pgnToTree(treeToPgn(first));
      expect(leafPaths(reparsed)).toEqual(leafPaths(first));
    });
  }
});

describe("buildForest", () => {
  it("nests children under parents in insertion order", () => {
    const nodes = pgnToTree("1. e4 e5 (1... c5) 2. Nf3");
    const forest = buildForest(nodes);
    expect(forest).toHaveLength(1); // single root: e4
    expect(forest[0].move).toBe("e4");
    // e5 inserted before c5, so it is the mainline (first) child.
    expect(forest[0].children.map((c) => c.move)).toEqual(["e5", "c5"]);
    expect(forest[0].children[0].children.map((c) => c.move)).toEqual(["Nf3"]);
  });
});
