import "server-only";

import { db } from "@/lib/db";
import { calculateWeeklyMode } from "@/lib/domain/weekly-study";

function parseAverage(value: string | undefined): number | null | "invalid" {
  if (value === undefined || value.trim() === "") return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^[1-5](?:\.\d{1,2})?$/.test(normalized)) return "invalid";
  const average = Number(normalized);
  return average >= 1 && average <= 5 ? average : "invalid";
}

export async function saveStudyAveragesForQuarter(input: {
  quarterId: string;
  nextWeekStartsOn: Date;
  rawAverages: Record<string, string>;
}): Promise<"invalid" | "unchanged" | "saved"> {
  return db.$transaction(async (transaction) => {
    const quarter = await transaction.academicQuarter.findUnique({ where: { id: input.quarterId } });
    if (!quarter) return "invalid";
    await transaction.academicQuarter.update({ where: { id: quarter.id }, data: { number: quarter.number } });
    const subjects = await transaction.subject.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    const averages = subjects.map((subject) => ({ subject, average: parseAverage(input.rawAverages[subject.id]) }));
    if (averages.some((item) => item.average === "invalid")) return "invalid";
    const changed = averages.filter(({ subject, average }) =>
      average === null
        ? subject.currentAverage !== null || subject.quarterId !== null
        : subject.quarterId !== quarter.id || subject.currentAverage?.toNumber() !== average,
    );
    if (changed.length === 0) return "unchanged";
    for (const { subject, average } of changed) {
      await transaction.subject.update({
        where: { id: subject.id },
        data: average === null
          ? { currentAverage: null, quarterId: null }
          : { currentAverage: average, quarterId: quarter.id },
      });
    }
    await transaction.weekDecision.updateMany({
      where: { startsOn: { gte: input.nextWeekStartsOn }, isStale: false },
      data: { isStale: true },
    });
    return "saved";
  });
}

export type StudyCalculationResult = { ok: true } | { noAverages: true } | { noSetting: true } | { noQuarter: true };

export async function calculateStudyModeForQuarter(input: {
  quarterId: string;
  startsOn: Date;
  endsOn: Date;
}): Promise<StudyCalculationResult> {
  return db.$transaction(async (transaction) => {
    const quarter = await transaction.academicQuarter.findUnique({ where: { id: input.quarterId } });
    if (!quarter) return { noQuarter: true };
    await transaction.academicQuarter.update({ where: { id: quarter.id }, data: { number: quarter.number } });
    const subjects = await transaction.subject.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    const subjectsWithAverages = subjects.filter(
      (subject) => subject.currentAverage !== null && subject.quarterId === quarter.id,
    );
    if (subjectsWithAverages.length === 0) return { noAverages: true };
    const result = calculateWeeklyMode(subjectsWithAverages.map((subject) => ({
      name: subject.name,
      priority: subject.priority,
      average: subject.currentAverage!.toNumber(),
    })));
    const setting = await transaction.screenModeSetting.findUnique({ where: { mode: result.mode } });
    if (!setting) return { noSetting: true };
    await transaction.weekDecision.upsert({
      where: { startsOn: input.startsOn },
      update: { endsOn: input.endsOn, mode: result.mode, dailyLimitMinutes: setting.dailyLimitMinutes, explanation: result.explanation, quarterId: quarter.id, isStale: false, calculatedAt: new Date() },
      create: { startsOn: input.startsOn, endsOn: input.endsOn, mode: result.mode, dailyLimitMinutes: setting.dailyLimitMinutes, explanation: result.explanation, quarterId: quarter.id },
    });
    return { ok: true };
  });
}
