import type { PrismaClient } from "../generated/prisma/client";
import { averageOfMarks, parseStudySheet } from "./domain/study-import";

export async function importStudySheet(db: PrismaClient, input: {
  rows: unknown[][];
  source: string;
  apply: boolean;
  nextWeekStartsOn: Date;
}) {
  const sheet = parseStudySheet(input.rows);
  const sortedDates = [...sheet.dates].sort((a, b) => +a - +b);
  return db.$transaction(async (tx) => {
    const quarters = await tx.academicQuarter.findMany({ where: {
      startsOn: { lte: sortedDates[0] }, endsOn: { gte: sortedDates.at(-1)! },
    } });
    if (quarters.length !== 1) throw new Error("Даты файла должны входить в одну учебную четверть");
    const quarter = quarters[0];
    // Serialize imports and manual average changes using the same quarter lock.
    if (input.apply) await tx.academicQuarter.update({ where: { id: quarter.id }, data: { number: quarter.number } });
    const subjects = await tx.subject.findMany({ where: { isActive: true } });
    const mapped = sheet.subjects.map((row) => {
      const subject = subjects.find((subject) => subject.name === row.name);
      if (!subject) throw new Error(`Не найден предмет: ${row.name}`);
      return { ...row, subject };
    });
    const report = [];
    let averagesChanged = false;
    for (const row of mapped) {
      const outside = await tx.studyMark.findMany({ where: {
        subjectId: row.subject.id, quarterId: quarter.id, deletedAt: null,
        OR: [{ date: { notIn: sheet.dates } }, { date: null }],
      } });
      const allMarks = [...outside, ...row.marks];
      const average = averageOfMarks(allMarks);
      report.push({ name: row.name, imported: row.marks.length, total: allMarks.length, average });
      if (!input.apply) continue;
      // The export is a snapshot: replace only its subject/date cells, including corrections.
      await tx.studyMark.deleteMany({ where: {
        subjectId: row.subject.id, quarterId: quarter.id, date: { in: sheet.dates },
      } });
      await tx.studyMark.createMany({ data: row.marks.map((mark) => ({
        ...mark, subjectId: row.subject.id, quarterId: quarter.id, source: input.source,
      })) });
      const changed = row.subject.currentAverage?.toNumber() !== (average ?? undefined)
        || (average !== null && row.subject.quarterId !== quarter.id);
      if (changed) {
        await tx.subject.update({ where: { id: row.subject.id }, data: {
          currentAverage: average, quarterId: average === null ? null : quarter.id,
        } });
        averagesChanged = true;
      }
    }
    if (averagesChanged) await tx.weekDecision.updateMany({
      where: { startsOn: { gte: input.nextWeekStartsOn }, isStale: false }, data: { isStale: true },
    });
    return { applied: input.apply, quarter: `${quarter.schoolYear}, ${quarter.number}`, report };
  });
}
