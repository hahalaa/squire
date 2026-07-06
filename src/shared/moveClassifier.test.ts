import { describe, expect, it } from "vitest";
import { classifyMove } from "./moveClassifier";

function classify(centipawnLoss: number) {
  return classifyMove({ centipawnLoss, wasWinningBeforeMove: false, isWinningAfterMove: false });
}

describe("classifyMove", () => {
  it.each([
    [0, "best"],
    [10, "best"],
    [11, "good"],
    [25, "good"],
    [26, "inaccuracy"],
    [100, "inaccuracy"],
    [101, "mistake"],
    [200, "mistake"],
    [201, "blunder"],
    [500, "blunder"],
  ] as const)("classifies %icp loss as %s", (centipawnLoss, expected) => {
    expect(classify(centipawnLoss)).toBe(expected);
  });

  it("classifies a move that squanders a winning position as a miss, even at blunder-level loss", () => {
    expect(
      classifyMove({ centipawnLoss: 300, wasWinningBeforeMove: true, isWinningAfterMove: false }),
    ).toBe("miss");
  });

  it("does not call a move a miss if the position was not winning before it", () => {
    expect(
      classifyMove({ centipawnLoss: 300, wasWinningBeforeMove: false, isWinningAfterMove: false }),
    ).toBe("blunder");
  });

  it("does not call a move a miss if the position is still winning after it", () => {
    expect(
      classifyMove({ centipawnLoss: 5, wasWinningBeforeMove: true, isWinningAfterMove: true }),
    ).toBe("best");
  });

  it("runs in under 5ms", () => {
    const start = performance.now();
    classify(50);
    expect(performance.now() - start).toBeLessThan(5);
  });
});
