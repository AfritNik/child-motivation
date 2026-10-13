import { describe, expect, it } from "vitest";
import { BONUS_SUBJECTS, marksAverage, recommendScreenTime, screenTimeColor } from "./screen-time";

describe("screen time without weekly cycles", () => {
  const calculate = (averages: (number | null)[]) => recommendScreenTime(averages.map((average, i) => ({ name: [...BONUS_SUBJECTS][i] ?? `Предмет ${i}`, average })));
  it.each([
    [[3, 3, 3], 0], [[3, 3], 15], [[3], 30], [[3.4, 3.69], 30],
    [[3.4, 3.7], 45], [[3.7], 60], [[4.5], 60], [[4.5001], 70],
    [[5, 5, 5], 90], [[5, 5, 5, 5, 5, 5, 5], 130],
    [[3, 5, 5], 50], [[null, 4], 60],
    [[3, 3, 3, 5, 5, 5, 5], 0], [[3, 3, 5, 5], 20],
    [[3, 3, 3.5], 15], [[5, 5, 3.5, 3.14], 35],
    [[5, 5, 5, 3.4, 3.5], 60], [[3.5, 3.5, 3.5, 3.5], 15],
  ])("%j => %i minutes", (averages, minutes) => expect(calculate(averages as number[])?.minutes).toBe(minutes));
  it("requires marks and excludes non-bonus subjects", () => {
    expect(calculate([null, null])).toBeNull();
    expect(recommendScreenTime([{ name: "Физкультура", average: 5 }])?.minutes).toBe(60);
  });
  it("uses unrounded averages for thresholds", () => {
    expect(marksAverage([{ value: 3 }, { value: 4 }, { value: 4 }])).toBeCloseTo(11 / 3);
    expect(marksAverage([])).toBeNull();
    expect(calculate([3.39999])?.minutes).toBe(30);
    expect(calculate([3.69999, 3.5])?.minutes).toBe(30);
  });
  it("maps time to the agreed colors", () => {
    expect([0, 15, 30, 60, 70, 80, 90, 100, 110, 120].map(screenTimeColor)).toEqual(["red", "orange", "yellow", "green", "cyan", "cyan", "blue", "blue", "purple", "purple"]);
  });
});
