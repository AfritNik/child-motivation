import { ScreenMode } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getMoscowWeekRange } from "@/lib/domain/chores-and-products";
import {
  databaseDateFromKey,
  getMoscowDateKey,
} from "@/lib/domain/daily-cycle";
import {
  GREEN_AVERAGE_THRESHOLD,
  SCREEN_MODE_LABELS,
  YELLOW_AVERAGE_THRESHOLD,
  addUtcDays,
  getStudyZone,
} from "@/lib/domain/weekly-study";
import { StudyAverageForm } from "./study-average-form";
import styles from "./page.module.css";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

export async function StudySection({ canEdit }: { canEdit: boolean }) {
  const dateKey = getMoscowDateKey();
  const today = databaseDateFromKey(dateKey);
  const currentWeek = getMoscowWeekRange(dateKey);
  const nextWeekStartsOn = currentWeek.endsBefore;
  const nextWeekEndsOn = addUtcDays(nextWeekStartsOn, 6);
  const [quarter, subjects, currentDecision, futureDecision, standardSetting] =
    await Promise.all([
      db.academicQuarter.findFirst({
        where: { startsOn: { lte: today }, endsOn: { gte: today } },
      }),
      db.subject.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      db.weekDecision.findFirst({
        where: { startsOn: { lte: currentWeek.startsOn }, isStale: false },
        orderBy: { startsOn: "desc" },
      }),
      db.weekDecision.findUnique({ where: { startsOn: nextWeekStartsOn } }),
      db.screenModeSetting.findUnique({
        where: { mode: ScreenMode.STANDARD },
      }),
    ]);

  const currentMode = currentDecision?.mode ?? ScreenMode.STANDARD;
  const currentLimit =
    currentDecision?.dailyLimitMinutes ?? standardSetting?.dailyLimitMinutes ?? 60;
  const calculationAllowed = Boolean(
    quarter &&
      nextWeekStartsOn >= quarter.startsOn &&
      nextWeekStartsOn <= quarter.endsOn,
  );
  const currentQuarterSubjects = subjects.map((subject) => {
    const isCurrent = subject.quarterId === quarter?.id;
    const average = isCurrent ? subject.currentAverage?.toNumber() ?? null : null;

    return { ...subject, average };
  });

  return (
    <section className={canEdit ? styles.reviewSection : styles.childSection}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Учёба</p>
          <h2>Экранный режим</h2>
        </div>
        {quarter ? (
          <span className={styles.counter}>
            {quarter.number}-я четверть · {quarter.schoolYear}
          </span>
        ) : (
          <span className={styles.counter}>Вне четверти</span>
        )}
      </div>

      <div className={styles.modeGrid}>
        <article className={styles.modeCard}>
          <span>Текущая неделя</span>
          <h3>{SCREEN_MODE_LABELS[currentMode]}</h3>
          <strong>{currentLimit} минут в день</strong>
          <p>
            {currentDecision
              ? currentDecision.explanation
              : "До первого недельного расчёта действует стартовый стандартный режим."}
          </p>
        </article>
        <article className={styles.modeCard}>
          <span>
            Следующая неделя · {formatDate(nextWeekStartsOn)}–
            {formatDate(nextWeekEndsOn)}
          </span>
          {futureDecision && !futureDecision.isStale ? (
            <>
              <h3>{SCREEN_MODE_LABELS[futureDecision.mode]}</h3>
              <strong>{futureDecision.dailyLimitMinutes} минут в день</strong>
              <p>{futureDecision.explanation}</p>
              <small>
                Расчёт актуален · {formatDateTime(futureDecision.calculatedAt)}
              </small>
            </>
          ) : (
            <>
              <h3>Сохраняется текущий</h3>
              <strong>{currentLimit} минут в день</strong>
              <p>
                {futureDecision?.isStale
                  ? "Средние изменились — нужен новый расчёт."
                  : quarter
                    ? calculationAllowed
                      ? "Режим следующей недели ещё не рассчитан."
                      : "Следующая неделя вне четверти, поэтому текущий режим сохранится."
                    : "Во время каникул и до начала четверти текущий режим сохраняется."}
              </p>
            </>
          )}
        </article>
      </div>

      <div className={styles.thresholds}>
        <span>Зелёная: от {GREEN_AVERAGE_THRESHOLD.toFixed(2)}</span>
        <span>
          Жёлтая: {YELLOW_AVERAGE_THRESHOLD.toFixed(2)}–
          {(GREEN_AVERAGE_THRESHOLD - 0.01).toFixed(2)}
        </span>
        <span>Красная: ниже {YELLOW_AVERAGE_THRESHOLD.toFixed(2)}</span>
      </div>

      <div className={styles.subjectList}>
        {currentQuarterSubjects.map((subject) => (
          <div key={subject.id} className={styles.subjectRow}>
            <span>{subject.name}</span>
            {subject.average === null ? (
              <strong>Нет среднего текущей четверти</strong>
            ) : (
              <strong data-zone={getStudyZone(subject.average)}>
                {subject.average.toFixed(2)}
              </strong>
            )}
          </div>
        ))}
      </div>

      {!quarter ? (
        <p className={styles.studyNotice}>
          Сейчас нет учебной четверти: прежние средние не используются, ввод и
          расчёт временно недоступны.
        </p>
      ) : null}

      {canEdit && quarter ? (
        <StudyAverageForm
          subjects={currentQuarterSubjects.map((subject) => ({
            id: subject.id,
            name: subject.name,
            average: subject.average,
          }))}
          calculationAllowed={calculationAllowed}
        />
      ) : null}
    </section>
  );
}
