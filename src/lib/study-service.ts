import "server-only";

import { db } from "@/lib/db";
import { calculateWeeklyMode } from "@/lib/domain/weekly-study";

function parseAverage(value: string | undefined): number | null {
  if (value === undefined) return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^[1-5](?:\.\d{1,2})?$/.test(normalized)) return null;
  const average = Number(normalized);
  return average >= 1 && average <= 5 ? average : null;
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
    if (averages.some((item) => item.average === null)) return "invalid";
    const changed = averages.filter(({ subject, average }) =>
      subject.quarterId !== quarter.id || subject.currentAverage?.toNumber() !== average,
    );
    if (changed.length === 0) return "unchanged";
    for (const { subject, average } of changed) {
      await transaction.subject.update({ where: { id: subject.id }, data: { currentAverage: average, quarterId: quarter.id } });
    }
    await transaction.weekDecision.updateMany({
      where: { startsOn: { gte: input.nextWeekStartsOn }, isStale: false },
      data: { isStale: true },
    });
    return "saved";
  });
}

export type StudyCalculationResult = { ok: true } | { missing: string[] } | { noSetting: true } | { noQuarter: true };

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
    const missing = subjects.filter((subject) => subject.currentAverage === null || subject.quarterId !== quarter.id);
    if (missing.length > 0) return { missing: missing.map((subject) => subject.name) };
    const result = calculateWeeklyMode(subjects.map((subject) => ({
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
