import { DailyCheckType } from "../../generated/prisma/client";
import { describe, expect, it } from "vitest";
import {
  DAILY_ITEM_DEFINITIONS,
  databaseDateFromKey,
  getMoscowDateKey,
  isDailyCheckType,
} from "./daily-cycle";

describe("daily cycle", () => {
  it("uses the Moscow calendar date around UTC midnight", () => {
    expect(getMoscowDateKey(new Date("2026-08-17T21:30:00.000Z"))).toBe(
      "2026-08-18",
    );
  });

  it("maps each daily item to its fixed reward", () => {
    expect(
      DAILY_ITEM_DEFINITIONS[DailyCheckType.SELF_DIRECTED_STUDY].points,
    ).toBe(3);
    expect(
      DAILY_ITEM_DEFINITIONS[DailyCheckType.PERSONAL_ROUTINE].points,
    ).toBe(1);
  });

  it("validates item types received from the browser", () => {
    expect(isDailyCheckType("PERSONAL_ROUTINE")).toBe(true);
    expect(isDailyCheckType("FREE_POINTS")).toBe(false);
  });

  it("converts a date key into a database date", () => {
    expect(databaseDateFromKey("2026-08-18").toISOString()).toBe(
      "2026-08-18T00:00:00.000Z",
    );
  });
});
