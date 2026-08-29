"use server";

import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getMoscowWeekRange } from "@/lib/domain/chores-and-products";
import {
  databaseDateFromKey,
  getMoscowDateKey,
} from "@/lib/domain/daily-cycle";
import { addUtcDays } from "@/lib/domain/weekly-study";
import { calculateStudyModeForQuarter, saveStudyAveragesForQuarter } from "@/lib/study-service";
import { revalidatePath } from "next/cache";

export type StudyFormState = {
  error?: string;
  message?: string;
};

async function getAdmin() {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user.role, "EDIT_AVERAGES")) return null;
  return user;
}

async function getWeeklyModeAdmin() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "SELECT_WEEKLY_MODE")) return null;
  return user;
}

async function getCurrentQuarter(date: Date) {
  return db.academicQuarter.findFirst({
    where: { startsOn: { lte: date }, endsOn: { gte: date } },
  });
}

export async function saveSubjectAverages(
  _previousState: StudyFormState,
  formData: FormData,
): Promise<StudyFormState> {
  const admin = await getAdmin();

  if (!admin) return { error: "Изменять средние может только администратор" };

  const date = databaseDateFromKey(getMoscowDateKey());
  const quarter = await getCurrentQuarter(date);

  if (!quarter) {
    return { error: "Сейчас нет учебной четверти. Старые средние не меняются" };
  }

  const currentWeek = getMoscowWeekRange(getMoscowDateKey());
  const nextWeekStartsOn = currentWeek.endsBefore;
  const rawAverages = Object.fromEntries([...formData.entries()]
    .filter((entry): entry is [string, string] => entry[0].startsWith("average:") && typeof entry[1] === "string")
    .map(([name, value]) => [name.slice("average:".length), value]));
  const result = await saveStudyAveragesForQuarter({ quarterId: quarter.id, nextWeekStartsOn, rawAverages });

  if (result === "invalid") return { error: "Введите среднее от 1,00 до 5,00 для каждого предмета" };
  if (result === "unchanged") return { message: "Средние уже сохранены без изменений" };

  revalidatePath("/");
  return { message: "Средние сохранены. Рассчитайте следующую неделю" };
}

export async function calculateNextWeekMode(
  _previousState: StudyFormState,
  _formData: FormData,
): Promise<StudyFormState> {
  void _previousState;
  void _formData;
  const admin = await getWeeklyModeAdmin();

  if (!admin) return { error: "Расчёт доступен только администратору" };

  const dateKey = getMoscowDateKey();
  const date = databaseDateFromKey(dateKey);
  const quarter = await getCurrentQuarter(date);

  if (!quarter) {
    return { error: "Сейчас нет учебной четверти. Действующий режим сохраняется" };
  }

  const currentWeek = getMoscowWeekRange(dateKey);
  const startsOn = currentWeek.endsBefore;
  const endsOn = addUtcDays(startsOn, 6);

  if (startsOn < quarter.startsOn || startsOn > quarter.endsOn) {
    return {
      error:
        "Следующая неделя находится вне текущей четверти. Действующий режим сохранится",
    };
  }

  const transactionResult = await calculateStudyModeForQuarter({ quarterId: quarter.id, startsOn, endsOn });

  if ("missing" in transactionResult && transactionResult.missing) {
    return { error: `Сначала сохраните средние текущей четверти: ${transactionResult.missing.join(", ")}` };
  }
  if ("noSetting" in transactionResult) return { error: "Для рассчитанного режима не задан лимит времени" };
  if ("noQuarter" in transactionResult) return { error: "Текущая четверть уже изменилась" };

  revalidatePath("/");
  return { message: "Режим следующей недели рассчитан" };
}
