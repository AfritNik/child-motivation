import { db } from "@/lib/db";
import { databaseDateFromKey, getMoscowDateKey } from "@/lib/domain/daily-cycle";
import { marksAverage, recommendScreenTime } from "@/lib/domain/screen-time";
import { StudyJournal } from "./study-journal";

export async function StudySection({ canEdit, adult = false }: { canEdit: boolean; adult?: boolean }) {
  const today = databaseDateFromKey(getMoscowDateKey());
  const [quarter, subjects, current] = await Promise.all([
    db.academicQuarter.findFirst({ where: { startsOn: { lte: today }, endsOn: { gte: today } } }),
    db.subject.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: {
      marks: { where: { deletedAt: null, quarter: { startsOn: { lte: today }, endsOn: { gte: today } } },
        orderBy: [{ date: { sort: "asc", nulls: "last" } }, { position: "asc" }, { id: "asc" }],
      },
    } }),
    db.screenTimeState.findUnique({ where: { id: 1 } }),
  ]);
  const rows = subjects.map((s) => ({
    id: s.id, name: s.name, average: marksAverage(s.marks),
    legacyAverage: !s.marks.length && s.quarterId === quarter?.id ? s.currentAverage?.toNumber() ?? null : null,
    marks: s.marks.map((m) => ({ id: m.id, value: m.value })),
  }));
  return <StudyJournal canEdit={canEdit} adult={adult}
    quarter={quarter ? { id: quarter.id, title: `${quarter.number}-я четверть · ${quarter.schoolYear}` } : null}
    subjects={rows} recommendation={quarter ? recommendScreenTime(rows) : null}
    current={{ minutes: current?.dailyLimitMinutes ?? 60, explanation: current?.explanation ?? "Стартовое время" }}
  />;
}
