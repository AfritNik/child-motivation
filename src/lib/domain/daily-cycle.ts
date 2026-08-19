import {
  DailyCheckType,
  PointReason,
} from "../../generated/prisma/client";

export const MOSCOW_TIME_ZONE = "Europe/Moscow";

export const DAILY_ITEM_DEFINITIONS = {
  [DailyCheckType.SELF_DIRECTED_STUDY]: {
    label: "Самостоятельные уроки",
    description: "Начал после одного напоминания и основную часть сделал сам.",
    points: 3,
    reason: PointReason.SELF_DIRECTED_STUDY,
  },
  [DailyCheckType.PERSONAL_ROUTINE]: {
    label: "Личная рутина и порядок",
    description: "Позаботился о себе, вещах и подготовке к следующему дню.",
    points: 1,
    reason: PointReason.PERSONAL_ROUTINE,
  },
} as const;

export function isDailyCheckType(value: string): value is DailyCheckType {
  return value in DAILY_ITEM_DEFINITIONS;
}

export function getMoscowDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not determine the Moscow calendar date");
  }

  return `${year}-${month}-${day}`;
}

export function databaseDateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function formatMoscowDate(dateKey: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(databaseDateFromKey(dateKey));
}
