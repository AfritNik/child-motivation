import "server-only";
import { db } from "@/lib/db";
import { marksAverage, recommendScreenTime } from "@/lib/domain/screen-time";

export class StudyJournalError extends Error {}

export type MarkChange = {
  quarterId: string;
  subjectId: string;
  markId: string;
  operation: "add" | "edit" | "delete" | "restore";
  value?: number;
  expectedValue?: number;
};

export async function changeStudyMark(input: MarkChange, today: Date) {
  if ((input.operation === "add" || input.operation === "edit") &&
    (!Number.isInteger(input.value) || input.value! < 2 || input.value! > 5)) {
    throw new StudyJournalError("Выберите оценку от 2 до 5");
  }
  return db.$transaction(async (tx) => {
    const quarter = await tx.academicQuarter.findFirst({ where: {
      id: input.quarterId, startsOn: { lte: today }, endsOn: { gte: today },
    } });
    if (!quarter) throw new StudyJournalError("Четверть изменилась. Обновите страницу");
    // Same lock as imports: edits and recalculations cannot lose each other's marks.
    await tx.academicQuarter.update({ where: { id: quarter.id }, data: { number: quarter.number } });
    const subject = await tx.subject.findFirst({ where: { id: input.subjectId, isActive: true } });
    if (!subject) throw new StudyJournalError("Предмет больше не доступен");
    const mark = await tx.studyMark.findUnique({ where: { id: input.markId } });
    if (input.operation === "add") {
      if (mark) {
        if (mark.subjectId === subject.id && mark.quarterId === quarter.id && mark.value === input.value && !mark.deletedAt) return;
        throw new StudyJournalError("Оценка уже изменена. Обновите страницу");
      }
      const last = await tx.studyMark.aggregate({ where: { subjectId: subject.id, quarterId: quarter.id }, _max: { position: true } });
      await tx.studyMark.create({ data: {
        id: input.markId, subjectId: subject.id, quarterId: quarter.id,
        value: input.value!, position: (last._max.position ?? -1) + 1, source: "manual",
      } });
    } else {
      if (!mark || mark.subjectId !== subject.id || mark.quarterId !== quarter.id ||
        mark.value !== input.expectedValue || (input.operation === "restore" ? !mark.deletedAt : !!mark.deletedAt)) {
        throw new StudyJournalError("Оценка уже изменена или удалена. Обновите страницу");
      }
      await tx.studyMark.update({ where: { id: mark.id }, data:
        input.operation === "delete" ? { deletedAt: new Date() } :
        input.operation === "restore" ? { deletedAt: null } : { value: input.value!, source: "manual" },
      });
    }
    const marks = await tx.studyMark.findMany({ where: { subjectId: subject.id, quarterId: quarter.id, deletedAt: null } });
    const average = marksAverage(marks);
    await tx.subject.update({ where: { id: subject.id }, data: {
      currentAverage: average === null ? null : Math.round(average * 100) / 100,
      quarterId: average === null ? null : quarter.id,
    } });
  });
}

export async function applyStudyTime(quarterId: string, expectedMinutes: number, today: Date) {
  return db.$transaction(async (tx) => {
    const quarter = await tx.academicQuarter.findFirst({ where: { id: quarterId, startsOn: { lte: today }, endsOn: { gte: today } } });
    if (!quarter) throw new StudyJournalError("Четверть изменилась. Обновите страницу");
    await tx.academicQuarter.update({ where: { id: quarter.id }, data: { number: quarter.number } });
    const subjects = await tx.subject.findMany({ where: { isActive: true }, include: {
      marks: { where: { quarterId: quarter.id, deletedAt: null }, select: { value: true } },
    } });
    const result = recommendScreenTime(subjects.map((s) => ({ name: s.name, average: marksAverage(s.marks) })));
    if (!result) throw new StudyJournalError("Сначала добавьте оценки текущей четверти");
    if (result.minutes !== expectedMinutes) throw new StudyJournalError("Оценки изменились. Проверьте новую рекомендацию и примените её ещё раз");
    await tx.screenTimeState.upsert({ where: { id: 1 },
      create: { id: 1, dailyLimitMinutes: result.minutes, explanation: result.explanation },
      update: { dailyLimitMinutes: result.minutes, explanation: result.explanation },
    });
    return result.minutes;
  });
}
