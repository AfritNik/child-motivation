"use server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { databaseDateFromKey, getMoscowDateKey } from "@/lib/domain/daily-cycle";
import { applyStudyTime, changeStudyMark, StudyJournalError, type MarkChange } from "@/lib/study-journal-service";
import { revalidatePath } from "next/cache";

export type StudyFormState = { error?: string; message?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveStudyMark(input: MarkChange): Promise<StudyFormState> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "EDIT_AVERAGES")) return { error: "Изменять оценки может только администратор" };
  if (!input || !uuid.test(input.quarterId) || !uuid.test(input.subjectId) || !uuid.test(input.markId) ||
    !["add", "edit", "delete", "restore"].includes(input.operation)) return { error: "Некорректные данные оценки" };
  try { await changeStudyMark(input, databaseDateFromKey(getMoscowDateKey())); }
  catch (error) {
    if (error instanceof StudyJournalError) { revalidatePath("/"); return { error: error.message }; }
    throw error;
  }
  revalidatePath("/");
  return { message: input.operation === "delete" ? "Оценка удалена" : input.operation === "restore" ? "Оценка восстановлена" : "Оценка сохранена. Время изменится только по кнопке «Применить сейчас»" };
}

export async function applyScreenTime(quarterId: string, expectedMinutes: number): Promise<StudyFormState> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "SELECT_WEEKLY_MODE")) return { error: "Применять время может только администратор" };
  if (!uuid.test(quarterId) || !Number.isInteger(expectedMinutes)) return { error: "Некорректные данные" };
  try {
    const minutes = await applyStudyTime(quarterId, expectedMinutes, databaseDateFromKey(getMoscowDateKey()));
    revalidatePath("/");
    return { message: `Применено: ${minutes} минут в день` };
  } catch (error) {
    if (error instanceof StudyJournalError) { revalidatePath("/"); return { error: error.message }; }
    throw error;
  }
}
