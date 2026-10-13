export const BONUS_SUBJECTS = new Set([
  "Математика", "Русский язык", "Английский язык", "География",
  "История", "Биология", "Литература",
]);

export function marksAverage(marks: readonly { value: number }[]): number | null {
  return marks.length ? marks.reduce((sum, mark) => sum + mark.value, 0) / marks.length : null;
}

export type StudyAverage = { name: string; average: number | null };

export function recommendScreenTime(subjects: readonly StudyAverage[]) {
  const rated = subjects.filter((s): s is { name: string; average: number } => s.average !== null);
  if (!rated.length) return null;
  const red = rated.filter((s) => s.average < 3.4);
  const yellow = rated.filter((s) => s.average >= 3.4 && s.average < 3.7);
  if (red.length >= 3) return { minutes: 0, explanation: `Красных предметов: ${red.length} — ${red.map((s) => s.name).join(", ")}.` };
  const bonus = rated.filter((s) => BONUS_SUBJECTS.has(s.name) && s.average > 4.5);
  const rawMinutes = 60 + bonus.length * 10 - yellow.length * 15 - red.length * 30;
  const minutes = Math.max(15, rawMinutes);
  const details = [
    bonus.length ? `+${bonus.length * 10} мин за среднее выше 4,50: ${bonus.map((s) => s.name).join(", ")}` : "",
    yellow.length ? `−${yellow.length * 15} мин за жёлтые: ${yellow.map((s) => s.name).join(", ")}` : "",
    red.length ? `−${red.length * 30} мин за красные: ${red.map((s) => s.name).join(", ")}` : "",
  ].filter(Boolean);
  return {
    minutes,
    explanation: `База 60 мин${details.length ? "; " + details.join("; ") : ""}. Итого: ${minutes} мин.${rawMinutes < 15 ? " Сохранён минимум 15 минут." : ""}`,
  };
}

export function screenTimeColor(minutes: number) {
  if (minutes === 0) return "red";
  if (minutes <= 15) return "orange";
  if (minutes < 60) return "yellow";
  if (minutes === 60) return "green";
  if (minutes <= 80) return "cyan";
  if (minutes <= 100) return "blue";
  return "purple";
}

export function averageColor(average: number) {
  if (average < 3.4) return "red";
  if (average < 3.7) return "yellow";
  if (average <= 4.5) return "green";
  if (average < 4.65) return "cyan";
  if (average < 4.85) return "blue";
  return "purple";
}
