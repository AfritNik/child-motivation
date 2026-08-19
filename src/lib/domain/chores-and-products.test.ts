import { describe, expect, it } from "vitest";
import {
  canAwardNewProduct,
  getMoscowWeekRange,
  normalizeProductName,
  selectChoreCompletionsForPoints,
} from "./chores-and-products";

describe("chores and new products", () => {
  it("normalizes a product name without changing its words", () => {
    expect(normalizeProductName("  Красное   яблоко  ")).toBe("Красное яблоко");
  });

  it("uses a Monday-to-Sunday week", () => {
    const range = getMoscowWeekRange("2026-08-18");

    expect(range.startsOn.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(range.endsBefore.toISOString()).toBe("2026-08-24T00:00:00.000Z");
  });

  it("awards at most the first two approved chores in marked order", () => {
    expect(
      selectChoreCompletionsForPoints([
        { id: "rejected", status: "REJECTED", pointSlotProcessed: false },
        { id: "first", status: "APPROVED", pointSlotProcessed: false },
        { id: "second", status: "APPROVED", pointSlotProcessed: false },
        { id: "third", status: "APPROVED", pointSlotProcessed: false },
      ]),
    ).toEqual(["first", "second"]);
  });

  it("waits for an earlier pending chore before awarding a later one", () => {
    expect(
      selectChoreCompletionsForPoints([
        { id: "pending", status: "PENDING", pointSlotProcessed: false },
        { id: "later", status: "APPROVED", pointSlotProcessed: false },
      ]),
    ).toEqual([]);
  });

  it("stops new-product points after three in the week", () => {
    expect(canAwardNewProduct(2)).toBe(true);
    expect(canAwardNewProduct(3)).toBe(false);
  });
});
