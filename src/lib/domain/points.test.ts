import { describe, expect, it } from "vitest";
import { calculateCappedEarning, calculateCorrectedBalance } from "./points";

describe("point balance limit", () => {
  it("awards the full amount below the limit", () => {
    expect(calculateCappedEarning(20, 100, 3)).toBe(3);
  });

  it("clips an earning at the limit", () => {
    expect(calculateCappedEarning(99, 100, 3)).toBe(1);
  });

  it("does not award above the limit", () => {
    expect(calculateCappedEarning(100, 100, 1)).toBe(0);
  });
});

describe("point balance correction", () => {
  it("allows an integer correction inside the balance boundaries", () => {
    expect(calculateCorrectedBalance(7, 100, -2)).toBe(5);
    expect(calculateCorrectedBalance(7, 100, 3)).toBe(10);
  });

  it("rejects zero, fractions, and results outside 0–100", () => {
    expect(calculateCorrectedBalance(7, 100, 0)).toBeNull();
    expect(calculateCorrectedBalance(7, 100, 1.5)).toBeNull();
    expect(calculateCorrectedBalance(1, 100, -2)).toBeNull();
    expect(calculateCorrectedBalance(99, 100, 2)).toBeNull();
  });
});
