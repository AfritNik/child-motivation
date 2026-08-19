import { describe, expect, test } from "vitest";
import { findCurrentQuarter } from "./academic-quarter";

const firstQuarter = {
  id: "quarter-1",
  startsOn: new Date("2026-09-01T00:00:00Z"),
  endsOn: new Date("2026-10-25T23:59:59Z"),
};

describe("findCurrentQuarter", () => {
  test("returns the quarter that contains the date", () => {
    expect(findCurrentQuarter([firstQuarter], new Date("2026-09-15"))).toBe(
      firstQuarter,
    );
  });

  test("returns null outside all quarters", () => {
    expect(findCurrentQuarter([firstQuarter], new Date("2026-10-26"))).toBeNull();
  });
});
