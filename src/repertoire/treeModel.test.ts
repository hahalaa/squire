import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { allNodeIds, flattenVisible, moveLabel } from "./treeModel";
import type { PositionNode } from "./types";

// Real FENs from chess.js so moveLabel is exercised against authoritative
// active-colour / fullmove fields (the same source the backend derives from).
function fenAfter(sans: string[]): string {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
}

function node(
  id: string,
  move: string,
  fen: string,
  children: PositionNode[] = [],
): PositionNode {
  return { id, repertoireId: "r", userId: "u", fen, move, parentId: null, children };
}

describe("moveLabel", () => {
  it("labels a White move with a full move number", () => {
    expect(moveLabel(fenAfter(["e4"]), "e4")).toBe("1. e4");
  });

  it("labels a Black move with the ellipsis form on the same move number", () => {
    expect(moveLabel(fenAfter(["e4", "e5"]), "e5")).toBe("1... e5");
  });

  it("advances the move number on White's second move", () => {
    expect(moveLabel(fenAfter(["e4", "e5", "Nf3"]), "Nf3")).toBe("2. Nf3");
  });

  it("labels a Black reply on the second move as 2...", () => {
    expect(moveLabel(fenAfter(["e4", "e5", "Nf3", "Nc6"]), "Nc6")).toBe("2... Nc6");
  });

  it("does not infer side from a hardcoded start colour — a Black-to-move root FEN reads from the FEN", () => {
    // A position where Black is to move after a White move: number tracks the FEN.
    expect(moveLabel(fenAfter(["d4"]), "d4")).toBe("1. d4");
  });

  it("falls back to the bare move on a malformed FEN rather than rendering NaN", () => {
    expect(moveLabel("not a fen", "e4")).toBe("e4");
  });
});

describe("flattenVisible", () => {
  // e4 -> e5 -> { Nf3 (mainline), Bc4 (variation) }
  const tree: PositionNode[] = [
    node("e4", "e4", "f1", [
      node("e5", "e5", "f2", [
        node("nf3", "Nf3", "f3"),
        node("bc4", "Bc4", "f4"),
      ]),
    ]),
  ];

  it("returns every node in depth-first order when all are expanded", () => {
    const rows = flattenVisible(tree, new Set(["e4", "e5", "nf3", "bc4"]));
    expect(rows.map((r) => r.node.id)).toEqual(["e4", "e5", "nf3", "bc4"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2]);
  });

  it("marks non-first children as variations, first child as mainline", () => {
    const rows = flattenVisible(tree, new Set(["e4", "e5"]));
    const nf3 = rows.find((r) => r.node.id === "nf3")!;
    const bc4 = rows.find((r) => r.node.id === "bc4")!;
    expect(nf3.isVariation).toBe(false);
    expect(bc4.isVariation).toBe(true);
  });

  it("hides descendants of a collapsed node but keeps the collapsed node itself", () => {
    const rows = flattenVisible(tree, new Set(["e4"])); // e5 collapsed
    expect(rows.map((r) => r.node.id)).toEqual(["e4", "e5"]);
    const e5 = rows.find((r) => r.node.id === "e5")!;
    expect(e5.hasChildren).toBe(true);
    expect(e5.isExpanded).toBe(false);
  });

  it("returns an empty list for an empty forest", () => {
    expect(flattenVisible([], new Set())).toEqual([]);
  });
});

describe("allNodeIds", () => {
  it("collects every id across the whole forest", () => {
    const tree: PositionNode[] = [
      node("a", "e4", "f1", [node("b", "e5", "f2", [node("c", "Nf3", "f3")])]),
      node("d", "d4", "f4"),
    ];
    expect(allNodeIds(tree).sort()).toEqual(["a", "b", "c", "d"]);
  });
});
