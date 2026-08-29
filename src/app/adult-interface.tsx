import { AccessRole, ReviewStatus } from "@/generated/prisma/client";
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
import { ConfirmActionDialog, RejectActionDialog } from "./action-dialog";
import { logout } from "./actions";
import { AppIcon } from "./app-icon";
import { approveTodayQueue } from "./adult-review-actions";
import {
  approveChoreCompletions,
  approveNewProduct,
  rejectChoreCompletion,
  rejectNewProduct,
} from "./chores-products-actions";
import { approveDailyChecks, rejectDailyCheck } from "./daily-actions";
import { OverdueSection } from "./overdue-section";
import { PointHistory } from "./point-history";
import { AdultRewardSection } from "./reward-sections";
import { RoleTabs, type RoleTab } from "./role-tabs";
import { SessionKeepAlive } from "./session-keep-alive";
import { StudySection } from "./study-section";
import styles from "./page.module.css";

type AdultUser = {
  id: string;
  displayName: string;
  role: AccessRole;
};

type ChildSummary = {
  id: string;
  displayName: string;
  pointBalanceLimit: number;
};

function pointsWord(value: number): string {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "баллов";
  if (last === 1) return "балл";
  if (last >= 2 && last <= 4) return "балла";
  return "баллов";
}

function formatDecisionTime(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(value) : "";
}

async function AdultReview({
  child,
  balance,
  overdueCursor,
}: {
  child: ChildSummary;
  balance: number;
  overdueCursor?: string;
}) {
  const dateKey = getMoscowDateKey();
  const date = databaseDateFromKey(dateKey);
  const week = getMoscowWeekRange(dateKey);
  const [checks, chores, product, weekProducts] = await Promise.all([
    db.dailyCheck.findMany({
      where: { childId: child.id, date },
      include: {
        pointTransaction: true,
        decidedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.choreCompletion.findMany({
      where: { childId: child.id, date },
      include: {
        chore: true,
        pointTransaction: true,
        decidedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.newProductEntry.findUnique({
      where: { childId_date: { childId: child.id, date } },
      include: {
        pointTransaction: true,
        decidedBy: { select: { displayName: true } },
      },
    }),
    db.newProductEntry.findMany({
      where: { childId: child.id, date: { gte: week.startsOn, lt: week.endsBefore } },
      include: { pointTransaction: true },
    }),
  ]);

  const pendingChecks = checks.filter((item) => item.status === ReviewStatus.PENDING);
  const pendingChores = chores.filter((item) => item.status === ReviewStatus.PENDING);
  const pendingProduct = product?.status === ReviewStatus.PENDING ? product : null;
  const decidedChecks = checks.filter((item) => item.status !== ReviewStatus.PENDING);
  const decidedChores = chores.filter((item) => item.status !== ReviewStatus.PENDING);
  const decidedProduct = product && product.status !== ReviewStatus.PENDING ? product : null;
  const awardedChorePoints = chores.filter((item) => item.pointTransaction).length;
  const awardedProductPoints = weekProducts.filter((item) => item.pointTransaction).length;
  const pendingPoints =
    pendingChecks.reduce((sum, item) => sum + DAILY_ITEM_DEFINITIONS[item.type].points, 0) +
    Math.min(pendingChores.length, Math.max(0, MAX_CHORE_POINTS_PER_DAY - awardedChorePoints)) +
    (pendingProduct && awardedProductPoints < MAX_NEW_PRODUCT_POINTS_PER_WEEK ? 1 : 0);
  const creditedPoints = Math.min(pendingPoints, Math.max(0, child.pointBalanceLimit - balance));
  const cutPoints = pendingPoints - creditedPoints;
  const pendingCount = pendingChecks.length + pendingChores.length + (pendingProduct ? 1 : 0);
  const bulkFields = [
    ...pendingChecks.map((item) => ({ name: "checkId", value: item.id })),
    ...pendingChores.map((item) => ({ name: "completionId", value: item.id })),
    ...(pendingProduct ? [{ name: "entryId", value: pendingProduct.id }] : []),
  ];

  const pendingItems = [
    ...pendingChecks.map((item) => ({
      id: item.id,
      label: DAILY_ITEM_DEFINITIONS[item.type].label,
      points: DAILY_ITEM_DEFINITIONS[item.type].points,
      approve: approveDailyChecks,
      reject: rejectDailyCheck,
      idName: "checkId",
      zeroReason: balance >= child.pointBalanceLimit ? "без балла — достигнут лимит баланса" : null,
    })),
    ...pendingChores.map((item, index) => ({
      id: item.id,
      label: item.chore.name,
      points: index < Math.max(0, MAX_CHORE_POINTS_PER_DAY - awardedChorePoints) ? 1 : 0,
      approve: approveChoreCompletions,
      reject: rejectChoreCompletion,
      idName: "completionId",
      zeroReason: balance >= child.pointBalanceLimit ? "без балла — достигнут лимит баланса" : index >= Math.max(0, MAX_CHORE_POINTS_PER_DAY - awardedChorePoints) ? "без балла — дневной лимит" : null,
    })),
    ...(pendingProduct ? [{
      id: pendingProduct.id,
      label: `Новый продукт: ${pendingProduct.name}`,
      points: awardedProductPoints < MAX_NEW_PRODUCT_POINTS_PER_WEEK ? 1 : 0,
      approve: approveNewProduct,
      reject: rejectNewProduct,
      idName: "entryId",
      zeroReason: balance >= child.pointBalanceLimit ? "без балла — достигнут лимит баланса" : awardedProductPoints >= MAX_NEW_PRODUCT_POINTS_PER_WEEK ? "без балла — недельный лимит" : null,
    }] : []),
  ];

  const decidedItems = [
    ...decidedChecks.map((item) => ({
      id: item.id,
      label: DAILY_ITEM_DEFINITIONS[item.type].label,
      status: item.status,
      reason: item.rejectionReason,
      points: item.pointTransaction?.amount ?? null,
      by: item.decidedBy?.displayName,
      decidedAt: item.decidedAt,
    })),
    ...decidedChores.map((item) => ({
      id: item.id,
      label: item.chore.name,
      status: item.status,
      reason: item.rejectionReason,
      points: item.pointTransaction?.amount ?? null,
      by: item.decidedBy?.displayName,
      decidedAt: item.decidedAt,
    })),
    ...(decidedProduct ? [{
      id: decidedProduct.id,
      label: `Новый продукт: ${decidedProduct.name}`,
      status: decidedProduct.status,
      reason: decidedProduct.rejectionReason,
      points: decidedProduct.pointTransaction?.amount ?? null,
      by: decidedProduct.decidedBy?.displayName,
      decidedAt: decidedProduct.decidedAt,
    }] : []),
  ];

  return (
    <>
      <section className={`${styles.adultHero} ${pendingCount === 0 ? styles.adultHeroEmpty : ""}`}>
        <p>{pendingCount > 0 ? "Нужно проверить сегодня" : "Проверка"}</p>
        <div>
          <h1>{pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? "действие" : pendingCount < 5 ? "действия" : "действий"}` : "На сегодня всё"}</h1>
          <strong>{pendingCount > 0 ? `до +${creditedPoints} ${pointsWord(creditedPoints)}` : "Новых отметок нет"}</strong>
        </div>
      </section>

      <OverdueSection
        childId={child.id}
        balance={balance}
        balanceLimit={child.pointBalanceLimit}
        cursor={overdueCursor}
      />

      <section className={styles.adultPanel} aria-labelledby="today-review-title">
        <div className={styles.adultSectionHeading}>
          <div><p className={styles.eyebrow}>{formatMoscowDate(dateKey)} · {child.displayName}</p><h2 id="today-review-title">Всё за один просмотр</h2></div>
          <span className={styles.counter}>{pendingCount}</span>
        </div>
        {pendingItems.length === 0 ? (
          <p className={styles.emptyState}>Все сегодняшние действия уже проверены.</p>
        ) : (
          <div className={styles.adultQueue}>
            {pendingItems.map((item) => (
              <article key={item.id} className={styles.adultQueueItem}>
                <span className={styles.queueDot} aria-hidden="true" />
                <div><strong>{item.label}</strong><small>{item.zeroReason ?? `до +${item.points}`}</small></div>
                <div className={styles.queueActions}>
                  <ConfirmActionDialog
                    action={item.approve}
                    fields={[{ name: item.idName, value: item.id }]}
                    triggerLabel="Подтвердить"
                    title="Подтвердить действие?"
                    description={`${item.label}. Сервер ещё раз проверит статус и лимиты перед начислением.`}
                    confirmLabel="Подтвердить"
                    triggerClassName={styles.approveTrigger}
                  />
                  <RejectActionDialog
                    action={item.reject}
                    idName={item.idName}
                    idValue={item.id}
                    itemLabel={item.label}
                  />
                </div>
              </article>
            ))}
            <ConfirmActionDialog
              action={approveTodayQueue}
              fields={bulkFields}
              triggerLabel={`Подтвердить всё · до +${creditedPoints}`}
              title="Подтвердить всё за сегодня?"
              description={`Будет заработано +${pendingPoints}, зачислено +${creditedPoints}, не зачислено из-за лимита: ${cutPoints}. Баланс: ${balance} → ${balance + creditedPoints}. Решение нельзя отменить.`}
              confirmLabel="Подтвердить всё"
              triggerClassName={styles.adultPrimaryButton}
            />
          </div>
        )}
      </section>

      {decidedItems.length > 0 ? (
        <section className={styles.adultPanel}>
          <div className={styles.adultSectionHeading}><h2>Решено сегодня</h2></div>
          <div className={styles.adultDecisionList}>
            {decidedItems.map((item) => (
              <div key={item.id} className={styles.adultDecisionItem}>
                <span>{item.label}</span>
                <strong data-status={item.status}>
                  {item.status === ReviewStatus.APPROVED
                    ? item.points === null ? "Подтверждено · без начисления" : `Подтверждено · +${item.points}`
                    : `Не подтверждено · ${item.reason ?? "причина не указана"}`}
                </strong>
                <small>{item.by ?? "Взрослый"}{item.decidedAt ? ` · ${formatDecisionTime(item.decidedAt)}` : ""}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

    </>
  );
}

export async function AdultInterface({
  user,
  requestedTab,
  overdueCursor,
}: {
  user: AdultUser;
  requestedTab?: string;
  overdueCursor?: string;
}) {
  const activeTab = ["review", "study", "rewards"].includes(requestedTab ?? "") ? requestedTab! : "review";
  const child = await db.user.findFirst({
    where: { role: AccessRole.CHILD, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, displayName: true, pointBalanceLimit: true },
  });

  if (!child) {
    return <main className={styles.errorPage}><h1>Детский аккаунт не найден</h1></main>;
  }

  const [balanceResult, pendingChecks, pendingChores, pendingProducts, pendingRewards] = await Promise.all([
    db.pointTransaction.aggregate({ where: { userId: child.id }, _sum: { amount: true } }),
    db.dailyCheck.count({ where: { childId: child.id, status: ReviewStatus.PENDING } }),
    db.choreCompletion.count({ where: { childId: child.id, status: ReviewStatus.PENDING } }),
    db.newProductEntry.count({ where: { childId: child.id, status: ReviewStatus.PENDING } }),
    db.rewardRequest.count({ where: { userId: child.id, status: "PENDING" } }),
  ]);
  const balance = balanceResult._sum.amount ?? 0;
  const reviewBadge = pendingChecks + pendingChores + pendingProducts;
  const tabs = [
    { id: "review", label: "Проверка", icon: "check", badge: reviewBadge },
    { id: "study", label: "Учёба", icon: "book" },
    { id: "rewards", label: "Награды", icon: "gift", badge: pendingRewards },
  ] as const satisfies readonly RoleTab[];

  return (
    <div className={styles.adultPage}>
      <SessionKeepAlive />
      <header className={styles.adultTopbar}>
        <div><small>{user.role === AccessRole.ADMIN ? "Администратор" : "Взрослый"}</small><strong>Привет, {user.displayName}!</strong></div>
        <div className={styles.adultTopActions}>
          <span className={styles.adultBalance}><small>Баланс Саши</small><strong>{balance} {pointsWord(balance)}</strong></span>
          <form action={logout}><button type="submit" className={styles.iconButton} aria-label="Выйти"><AppIcon name="logout" /></button></form>
        </div>
      </header>
      <main className={styles.adultContent} id="main-content">
        {activeTab === "review" ? <AdultReview child={child} balance={balance} overdueCursor={overdueCursor} /> : null}
        {activeTab === "study" ? <StudySection canEdit={user.role === AccessRole.ADMIN} adult /> : null}
        {activeTab === "rewards" ? (
          <>
            <AdultRewardSection childId={child.id} balance={balance} />
            <PointHistory userId={child.id} canCorrect={user.role === AccessRole.ADMIN} currentBalance={balance} balanceLimit={child.pointBalanceLimit} />
          </>
        ) : null}
      </main>
      <RoleTabs tabs={tabs} activeTab={activeTab} variant="bottom" />
    </div>
  );
}
