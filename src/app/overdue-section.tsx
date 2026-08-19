import { ReviewStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  MAX_CHORE_POINTS_PER_DAY,
  MAX_NEW_PRODUCT_POINTS_PER_WEEK,
  getMoscowWeekRange,
} from "@/lib/domain/chores-and-products";
import {
  DAILY_ITEM_DEFINITIONS,
  databaseDateFromKey,
  formatMoscowDate,
  getMoscowDateKey,
} from "@/lib/domain/daily-cycle";
import Link from "next/link";
import {
  approveChoreCompletions,
  approveNewProduct,
  rejectChoreCompletion,
  rejectNewProduct,
} from "./chores-products-actions";
import { approveDailyChecks, rejectDailyCheck } from "./daily-actions";
import { approveOverdueDay } from "./overdue-actions";
import styles from "./page.module.css";

type PendingDay = {
  dateKey: string;
  checks: Awaited<ReturnType<typeof loadPendingData>>[0];
  chores: Awaited<ReturnType<typeof loadPendingData>>[1];
  products: Awaited<ReturnType<typeof loadPendingData>>[2];
};

async function loadPendingData(childId: string, today: Date) {
  return Promise.all([
    db.dailyCheck.findMany({
      where: { childId, date: { lt: today }, status: ReviewStatus.PENDING },
      orderBy: { date: "asc" },
    }),
    db.choreCompletion.findMany({
      where: { childId, date: { lt: today }, status: ReviewStatus.PENDING },
      include: { chore: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    db.newProductEntry.findMany({
      where: { childId, date: { lt: today }, status: ReviewStatus.PENDING },
      orderBy: { date: "asc" },
    }),
  ]);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function OverdueSection({
  childId,
  balance,
  balanceLimit,
  visibleDays,
}: {
  childId: string;
  balance: number;
  balanceLimit: number;
  visibleDays: number;
}) {
  const today = databaseDateFromKey(getMoscowDateKey());
  const [checks, chores, products] = await loadPendingData(childId, today);
  const grouped = new Map<string, PendingDay>();

  const getDay = (key: string): PendingDay => {
    const existing = grouped.get(key);
    if (existing) return existing;
    const created: PendingDay = { dateKey: key, checks: [], chores: [], products: [] };
    grouped.set(key, created);
    return created;
  };

  for (const check of checks) getDay(dateKey(check.date)).checks.push(check);
  for (const chore of chores) getDay(dateKey(chore.date)).chores.push(chore);
  for (const product of products) getDay(dateKey(product.date)).products.push(product);

  const days = [...grouped.values()].sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey),
  );

  if (days.length === 0) return null;

  const allDates = days.map((day) => databaseDateFromKey(day.dateKey));
  const [allChores, allProducts] = await Promise.all([
    db.choreCompletion.findMany({
      where: { childId, date: { in: allDates } },
      include: { pointTransaction: true },
    }),
    db.newProductEntry.findMany({
      where: { childId },
      include: { pointTransaction: true },
    }),
  ]);

  return (
    <section className={styles.overdueSection}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Не потеряно</p>
          <h2>Просроченные дни</h2>
        </div>
        <span className={styles.counter}>{days.length}</span>
      </div>
      <p className={styles.sectionDescription}>
        Сначала раскройте день и проверьте действия. Общего подтверждения всех
        дней нет.
      </p>
      <div className={styles.overdueList}>
        {days.slice(0, visibleDays).map((day) => {
          const awardedChores = allChores.filter(
            (chore) => dateKey(chore.date) === day.dateKey && chore.pointTransaction,
          ).length;
          const week = getMoscowWeekRange(day.dateKey);
          const awardedProducts = allProducts.filter(
            (product) =>
              product.date >= week.startsOn &&
              product.date < week.endsBefore &&
              product.pointTransaction,
          ).length;
          const potential =
            day.checks.reduce(
              (sum, check) => sum + DAILY_ITEM_DEFINITIONS[check.type].points,
              0,
            ) +
            Math.min(
              day.chores.length,
              Math.max(0, MAX_CHORE_POINTS_PER_DAY - awardedChores),
            ) +
            (day.products.length > 0 &&
            awardedProducts < MAX_NEW_PRODUCT_POINTS_PER_WEEK
              ? 1
              : 0);
          const expected = Math.min(
            potential,
            Math.max(0, balanceLimit - balance),
          );
          const itemCount =
            day.checks.length + day.chores.length + day.products.length;

          return (
            <details key={day.dateKey} className={styles.overdueDay}>
              <summary>
                <span>
                  <strong>{formatMoscowDate(day.dateKey)}</strong>
                  <small>{itemCount} отметок</small>
                </span>
                <b>до +{expected}</b>
              </summary>
              <div className={styles.overdueItems}>
                {day.checks.map((check) => (
                  <article key={check.id} className={styles.overdueItem}>
                    <strong>{DAILY_ITEM_DEFINITIONS[check.type].label}</strong>
                    <form action={approveDailyChecks}>
                      <input type="hidden" name="checkId" value={check.id} />
                      <button type="submit">Подтвердить</button>
                    </form>
                    <form action={rejectDailyCheck} className={styles.compactRejectForm}>
                      <input type="hidden" name="checkId" value={check.id} />
                      <input name="rejectionReason" minLength={2} maxLength={200} required placeholder="Причина" />
                      <button type="submit">Отклонить</button>
                    </form>
                  </article>
                ))}
                {day.chores.map((chore) => (
                  <article key={chore.id} className={styles.overdueItem}>
                    <strong>{chore.chore.name}</strong>
                    <form action={approveChoreCompletions}>
                      <input type="hidden" name="completionId" value={chore.id} />
                      <button type="submit">Подтвердить</button>
                    </form>
                    <form action={rejectChoreCompletion} className={styles.compactRejectForm}>
                      <input type="hidden" name="completionId" value={chore.id} />
                      <input name="rejectionReason" minLength={2} maxLength={200} required placeholder="Причина" />
                      <button type="submit">Отклонить</button>
                    </form>
                  </article>
                ))}
                {day.products.map((product) => (
                  <article key={product.id} className={styles.overdueItem}>
                    <strong>Новый продукт: {product.name}</strong>
                    <form action={approveNewProduct}>
                      <input type="hidden" name="entryId" value={product.id} />
                      <button type="submit">Подтвердить</button>
                    </form>
                    <form action={rejectNewProduct} className={styles.compactRejectForm}>
                      <input type="hidden" name="entryId" value={product.id} />
                      <input name="rejectionReason" minLength={2} maxLength={200} required placeholder="Причина" />
                      <button type="submit">Отклонить</button>
                    </form>
                  </article>
                ))}
              </div>
              <form action={approveOverdueDay} className={styles.approveDayForm}>
                {day.checks.map((check) => <input key={check.id} type="hidden" name="checkId" value={check.id} />)}
                {day.chores.map((chore) => <input key={chore.id} type="hidden" name="completionId" value={chore.id} />)}
                {day.products.map((product) => <input key={product.id} type="hidden" name="entryId" value={product.id} />)}
                <button type="submit">Подтвердить этот день</button>
              </form>
            </details>
          );
        })}
      </div>
      {days.length > visibleDays ? (
        <Link href={`/?tab=review&overdue=${visibleDays + 5}`} className={styles.moreLink}>
          Показать ещё
        </Link>
      ) : null}
    </section>
  );
}
