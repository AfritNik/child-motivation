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
import { ConfirmActionDialog, RejectActionDialog } from "./action-dialog";
import styles from "./page.module.css";

type PendingDay = {
  dateKey: string;
  checks: Awaited<ReturnType<typeof loadPendingData>>[0];
  chores: Awaited<ReturnType<typeof loadPendingData>>[1];
  products: Awaited<ReturnType<typeof loadPendingData>>[2];
};

const PAGE_SIZE = 5;

async function loadPendingData(childId: string, today: Date, cursor?: string) {
  const cursorDate = cursor && /^\d{4}-\d{2}-\d{2}$/.test(cursor) ? databaseDateFromKey(cursor) : undefined;
  const where = { childId, date: { lt: today, ...(cursorDate ? { gt: cursorDate } : {}) }, status: ReviewStatus.PENDING };
  const [checkDates, choreDates, productDates] = await Promise.all([
    db.dailyCheck.findMany({ where, select: { date: true }, distinct: ["date"], orderBy: { date: "asc" }, take: PAGE_SIZE + 1 }),
    db.choreCompletion.findMany({ where, select: { date: true }, distinct: ["date"], orderBy: { date: "asc" }, take: PAGE_SIZE + 1 }),
    db.newProductEntry.findMany({ where, select: { date: true }, distinct: ["date"], orderBy: { date: "asc" }, take: PAGE_SIZE + 1 }),
  ]);
  const keys = [...new Set([...checkDates, ...choreDates, ...productDates].map((item) => dateKey(item.date)))].sort();
  const selectedDates = keys.slice(0, PAGE_SIZE).map(databaseDateFromKey);
  const selectedWhere = { childId, date: { in: selectedDates }, status: ReviewStatus.PENDING };
  const [checks, chores, products] = await Promise.all([
    db.dailyCheck.findMany({ where: selectedWhere, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    db.choreCompletion.findMany({ where: selectedWhere, include: { chore: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    db.newProductEntry.findMany({ where: selectedWhere, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
  ]);
  return [checks, chores, products, keys.length > PAGE_SIZE] as const;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function OverdueSection({
  childId,
  balance,
  balanceLimit,
  cursor,
}: {
  childId: string;
  balance: number;
  balanceLimit: number;
  cursor?: string;
}) {
  const today = databaseDateFromKey(getMoscowDateKey());
  const [checks, chores, products, hasMore] = await loadPendingData(childId, today, cursor);
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
  const productWeeks = [...new Map(days.map((day) => {
    const range = getMoscowWeekRange(day.dateKey);
    return [range.startsOn.toISOString(), range];
  })).values()];
  const [allChores, allProducts] = await Promise.all([
    db.choreCompletion.findMany({
      where: { childId, date: { in: allDates } },
      include: { pointTransaction: true },
    }),
    db.newProductEntry.findMany({
      where: { childId, OR: productWeeks.map((range) => ({ date: { gte: range.startsOn, lt: range.endsBefore } })) },
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
        <span className={styles.counter}>{days.length}{hasMore ? "+" : ""}</span>
      </div>
      <p className={styles.sectionDescription}>
        Сначала раскройте день и проверьте действия. Общего подтверждения всех
        дней нет.
      </p>
      <div className={styles.overdueList}>
        {days.map((day) => {
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
                    <ConfirmActionDialog action={approveDailyChecks} fields={[{ name: "checkId", value: check.id }]} triggerLabel="Подтвердить" title="Подтвердить действие?" description={`${DAILY_ITEM_DEFINITIONS[check.type].label}. Баллы относятся к исходной дате.`} confirmLabel="Подтвердить" triggerClassName={styles.approveTrigger} />
                    <RejectActionDialog action={rejectDailyCheck} idName="checkId" idValue={check.id} itemLabel={DAILY_ITEM_DEFINITIONS[check.type].label} />
                  </article>
                ))}
                {day.chores.map((chore) => (
                  <article key={chore.id} className={styles.overdueItem}>
                    <strong>{chore.chore.name}</strong>
                    <ConfirmActionDialog action={approveChoreCompletions} fields={[{ name: "completionId", value: chore.id }]} triggerLabel="Подтвердить" title="Подтвердить дело?" description={`${chore.chore.name}. Баллы относятся к исходной дате.`} confirmLabel="Подтвердить" triggerClassName={styles.approveTrigger} />
                    <RejectActionDialog action={rejectChoreCompletion} idName="completionId" idValue={chore.id} itemLabel={chore.chore.name} />
                  </article>
                ))}
                {day.products.map((product) => (
                  <article key={product.id} className={styles.overdueItem}>
                    <strong>Новый продукт: {product.name}</strong>
                    <ConfirmActionDialog action={approveNewProduct} fields={[{ name: "entryId", value: product.id }]} triggerLabel="Подтвердить" title="Подтвердить продукт?" description={`${product.name}. Недельный лимит проверится по исходной дате.`} confirmLabel="Подтвердить" triggerClassName={styles.approveTrigger} />
                    <RejectActionDialog action={rejectNewProduct} idName="entryId" idValue={product.id} itemLabel={`Новый продукт: ${product.name}`} />
                  </article>
                ))}
              </div>
              <div className={styles.approveDayForm}>
                <ConfirmActionDialog
                  action={approveOverdueDay}
                  fields={[
                    ...day.checks.map((check) => ({ name: "checkId", value: check.id })),
                    ...day.chores.map((chore) => ({ name: "completionId", value: chore.id })),
                    ...day.products.map((product) => ({ name: "entryId", value: product.id })),
                  ]}
                  triggerLabel="Подтвердить этот день"
                  title={`Подтвердить ${formatMoscowDate(day.dateKey)}?`}
                  description={`Будет заработано +${potential}, зачислено +${expected}, не зачислено из-за лимита: ${potential - expected}. Баланс: ${balance} → ${balance + expected}. Сервер повторно проверит точный состав очереди.`}
                  confirmLabel="Подтвердить день"
                  triggerClassName={styles.adultPrimaryButton}
                />
              </div>
            </details>
          );
        })}
      </div>
      {hasMore ? (
        <Link href={`/?tab=review&overdueCursor=${days.at(-1)!.dateKey}`} className={styles.moreLink}>
          Следующие просроченные дни
        </Link>
      ) : null}
    </section>
  );
}
