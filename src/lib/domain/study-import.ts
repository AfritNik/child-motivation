const aliases: Record<string, string> = {
  "Изобразительное искусство": "ИЗО",
  "Иностранный язык (английский)": "Английский язык",
  "Английский": "Английский язык",
  "Труд (технология)": "Труд",
  "Физическая культура": "Физкультура",
};

export function parseGradeCell(raw: unknown): number[] {
  const cell = String(raw ?? "").trim();
  if (!/^[1-5•Н!\s,;/]*$/u.test(cell)) {
    throw new Error(`Неизвестное обозначение в отметках: ${cell}`);
  }
  return (cell.match(/[1-5]/g) ?? []).map(Number);
}

export function averageOfMarks(marks: readonly { value: number }[]): number | null {
  return marks.length ? Math.round(marks.reduce((sum, mark) => sum + mark.value, 0) / marks.length * 100) / 100 : null;
}

export function parseStudySheet(rows: unknown[][]) {
  const headerIndex = rows.findIndex((row) => row[0] === "Предметы");
  if (headerIndex < 0) throw new Error("Не найдена строка «Предметы»");
  const dates = rows[headerIndex].flatMap((cell, column) => {
    const match = String(cell).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return [];
    const key = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${key}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key) throw new Error(`Некорректная дата: ${cell}`);
    return [{ column, date }];
  });
  if (!dates.length || new Set(dates.map(({ date }) => +date)).size !== dates.length) throw new Error("Нет дат или даты повторяются");
  const subjects = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (!row[0]) break;
    const originalName = String(row[0]).trim();
    const name = aliases[originalName] ?? originalName;
    const marks = dates.flatMap(({ column, date }) =>
      parseGradeCell(row[column]).map((value, position) => ({ date, value, position })),
    );
    subjects.push({ name, marks });
  }
  if (!subjects.length || new Set(subjects.map(({ name }) => name)).size !== subjects.length) throw new Error("Нет предметов или предметы повторяются");
  return { dates: dates.map(({ date }) => date), subjects };
}
