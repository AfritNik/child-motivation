import { describe, expect, it } from "vitest";
import { averageOfMarks, parseGradeCell, parseStudySheet } from "./study-import";

describe("diary marks", () => {
  it("separates grades from attendance and remarks without dropping repeated grades", () => {
    expect(parseGradeCell("5! • Н 4 4")).toEqual([5, 4, 4]);
    expect(parseGradeCell("••!")).toEqual([]);
    expect(() => parseGradeCell("5(2)")).toThrow();
    expect(averageOfMarks([{ value: 4 }, { value: 5 }, { value: 5 }])).toBe(4.67);
    expect(averageOfMarks([])).toBeNull();
  });
  it("maps diary subjects and ignores totals outside date columns", () => {
    const sheet = parseStudySheet([
      ["Предметы", "03.09.2026", "Итог:"],
      ["Изобразительное искусство", "5!", "4"],
      ["Иностранный язык (английский)", "Н", "5"],
      [null],
    ]);
    expect(sheet.subjects.map(({ name, marks }) => [name, marks.map(({ value }) => value)])).toEqual([["ИЗО", [5]], ["Английский язык", []]]);
    expect(sheet.subjects[0].marks[0].date.toISOString()).toBe("2026-09-03T00:00:00.000Z");
  });
  it("rejects invalid and duplicate dates", () => {
    expect(() => parseStudySheet([["Предметы", "31.09.2026"], ["Труд", "5"]])).toThrow();
    expect(() => parseStudySheet([["Предметы", "01.09.2026", "01.09.2026"], ["Труд", "5", "5"]])).toThrow();
  });
});
