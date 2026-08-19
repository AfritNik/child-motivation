import { ScreenMode, SubjectPriority } from "../../generated/prisma/client";
import { describe, expect, test } from "vitest";
import { calculateWeeklyMode, getStudyZone } from "./weekly-study";

describe("getStudyZone", () => {
  test("uses the accepted boundaries", () => {
    expect(getStudyZone(3.7)).toBe("GREEN");
    expect(getStudyZone(3.69)).toBe("YELLOW");
    expect(getStudyZone(3.4)).toBe("YELLOW");
    expect(getStudyZone(3.39)).toBe("RED");
  });
});

describe("calculateWeeklyMode", () => {
  test("selects recovery when any subject is red", () => {
    const result = calculateWeeklyMode([
      { name: "Математика", priority: SubjectPriority.HIGH, average: 3.39 },
      { name: "Русский язык", priority: SubjectPriority.HIGH, average: 4.2 },
    ]);

    expect(result.mode).toBe(ScreenMode.RECOVERY);
    expect(result.explanation).toContain("Математика");
  });

  test("selects standard for a yellow priority subject without red subjects", () => {
    const result = calculateWeeklyMode([
      { name: "Математика", priority: SubjectPriority.HIGH, average: 3.62 },
      { name: "Музыка", priority: SubjectPriority.NORMAL, average: 3.5 },
    ]);

    expect(result.mode).toBe(ScreenMode.STANDARD);
  });

  test("allows yellow normal subjects in full mode", () => {
    const result = calculateWeeklyMode([
      { name: "Математика", priority: SubjectPriority.HIGH, average: 3.7 },
      { name: "Музыка", priority: SubjectPriority.NORMAL, average: 3.4 },
    ]);

    expect(result.mode).toBe(ScreenMode.FULL);
  });
});
