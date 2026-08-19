"use server";

import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getMoscowWeekRange } from "@/lib/domain/chores-and-products";
import {
  databaseDateFromKey,
  getMoscowDateKey,
} from "@/lib/domain/daily-cycle";
import {
  addUtcDays,
  calculateWeeklyMode,
} from "@/lib/domain/weekly-study";
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

async function getCurrentQuarter(date: Date) {
  return db.academicQuarter.findFirst({
    where: { startsOn: { lte: date }, endsOn: { gte: date } },
  });
}

function parseAverage(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");

  if (!/^[1-5](?:\.\d{1,2})?$/.test(normalized)) return null;

  const average = Number(normalized);
  return average >= 1 && average <= 5 ? average : null;
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

  const subjects = await db.subject.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const averages = subjects.map((subject) => ({
    subject,
    average: parseAverage(formData.get(`average:${subject.id}`)),
  }));

  if (averages.some((item) => item.average === null)) {
    return { error: "Введите среднее от 1,00 до 5,00 для каждого предмета" };
  }

  const changed = averages.filter(
    ({ subject, average }) =>
      subject.quarterId !== quarter.id ||
      subject.currentAverage?.toNumber() !== average,
  );

  if (changed.length === 0) {
    return { message: "Средние уже сохранены без изменений" };
  }

  const currentWeek = getMoscowWeekRange(getMoscowDateKey());
  const nextWeekStartsOn = currentWeek.endsBefore;

  await db.$transaction(async (transaction) => {
    for (const { subject, average } of changed) {
      await transaction.subject.update({
        where: { id: subject.id },
        data: { currentAverage: average, quarterId: quarter.id },
      });
    }

    await transaction.weekDecision.updateMany({
      where: { startsOn: { gte: nextWeekStartsOn }, isStale: false },
      data: { isStale: true },
    });
  });

  revalidatePath("/");
  return { message: "Средние сохранены. Рассчитайте следующую неделю" };
}

export async function calculateNextWeekMode(
  _previousState: StudyFormState,
  _formData: FormData,
): Promise<StudyFormState> {
  void _previousState;
  void _formData;
  const admin = await getAdmin();

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

  const subjects = await db.subject.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const missing = subjects.filter(
    (subject) =>
      subject.currentAverage === null || subject.quarterId !== quarter.id,
  );

  if (missing.length > 0) {
    return {
      error: `Сначала сохраните средние текущей четверти: ${missing
        .map((subject) => subject.name)
        .join(", ")}`,
    };
  }

  const result = calculateWeeklyMode(
    subjects.map((subject) => ({
      name: subject.name,
      priority: subject.priority,
      average: subject.currentAverage!.toNumber(),
    })),
  );
  const setting = await db.screenModeSetting.findUnique({
    where: { mode: result.mode },
  });

  if (!setting) return { error: "Для рассчитанного режима не задан лимит времени" };

  await db.weekDecision.upsert({
    where: { startsOn },
    update: {
      endsOn,
      mode: result.mode,
      dailyLimitMinutes: setting.dailyLimitMinutes,
      explanation: result.explanation,
      quarterId: quarter.id,
      isStale: false,
      calculatedAt: new Date(),
    },
    create: {
      startsOn,
      endsOn,
      mode: result.mode,
      dailyLimitMinutes: setting.dailyLimitMinutes,
      explanation: result.explanation,
      quarterId: quarter.id,
    },
  });

  revalidatePath("/");
  return { message: "Режим следующей недели рассчитан" };
}
