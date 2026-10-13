import {
  ScreenMode,
  SubjectPriority,
} from "../../generated/prisma/client";

export const GREEN_AVERAGE_THRESHOLD = 3.7;
export const YELLOW_AVERAGE_THRESHOLD = 3.4;

export type StudyZone = "GREEN" | "YELLOW" | "RED";

export type SubjectForMode = {
  name: string;
  priority: SubjectPriority;
  average: number;
};

export const SCREEN_MODE_LABELS: Record<ScreenMode, string> = {
  [ScreenMode.FULL]: "Полный",
  [ScreenMode.STANDARD]: "Стандартный",
  [ScreenMode.RECOVERY]: "Восстановительный",
};

export function getStudyZone(average: number): StudyZone {
  if (average >= GREEN_AVERAGE_THRESHOLD) return "GREEN";
  if (average >= YELLOW_AVERAGE_THRESHOLD) return "YELLOW";
  return "RED";
}

export function calculateWeeklyMode(subjects: readonly SubjectForMode[]): {
  mode: ScreenMode;
  explanation: string;
} {
  const withZones = subjects.map((subject) => ({
    ...subject,
    zone: getStudyZone(subject.average),
  }));
  const redSubject = [...withZones]
    .filter((subject) => subject.zone === "RED")
    .sort((left, right) => left.average - right.average)[0];

  if (redSubject) {
    return {
      mode: ScreenMode.RECOVERY,
      explanation: `${redSubject.name}: среднее ${redSubject.average.toFixed(2)} находится в красной зоне.`,
    };
  }

  const yellowPrioritySubject = withZones.find(
    (subject) =>
      subject.priority === SubjectPriority.HIGH && subject.zone === "YELLOW",
  );

  if (yellowPrioritySubject) {
    return {
      mode: ScreenMode.STANDARD,
      explanation: `${yellowPrioritySubject.name}: среднее ${yellowPrioritySubject.average.toFixed(2)} находится в жёлтой зоне.`,
    };
  }

  return {
    mode: ScreenMode.FULL,
    explanation:
      "Среди предметов с оценками все приоритетные находятся в зелёной зоне, красных предметов нет.",
  };
}

export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
