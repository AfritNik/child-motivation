import { DailyCheckType, ReviewStatus } from "@/generated/prisma/client";
import Link from "next/link";
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
import { logout } from "./actions";
import { AppIcon } from "./app-icon";
import { ChoreToggle } from "./chore-toggle";
import { DailyCheckToggle } from "./daily-check-toggle";
import { NewProductForm } from "./new-product-form";
import { PointHistory } from "./point-history";
import { ChildRewardSection } from "./reward-sections";
import { RoleTabs, type RoleTab } from "./role-tabs";
import { SessionKeepAlive } from "./session-keep-alive";
import { StudySection } from "./study-section";
import styles from "./page.module.css";

const childTabs = [
  { id: "today", label: "Сегодня", icon: "check" },
  { id: "study", label: "Учёба", icon: "book" },
  { id: "chores", label: "Дела", icon: "home" },
  { id: "rewards", label: "Награды", icon: "gift" },
] as const satisfies readonly RoleTab[];

const dailyTypes = [
  DailyCheckType.SELF_DIRECTED_STUDY,
  DailyCheckType.PERSONAL_ROUTINE,
] as const;

type ChildUser = {
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

async function ChildToday({ user, balance }: { user: ChildUser; balance: number }) {
  const dateKey = getMoscowDateKey();
  const date = databaseDateFromKey(dateKey);
  const week = getMoscowWeekRange(dateKey);
  const [
    checks,
    choreCompletions,
    newProductEntry,
    weekProductEntries,
    nearestReward,
  ] = await Promise.all([
    db.dailyCheck.findMany({
      where: { childId: user.id, date },
      include: { pointTransaction: true },
    }),
    db.choreCompletion.findMany({
      where: { childId: user.id, date },
      include: { pointTransaction: true },
      orderBy: { createdAt: "asc" },
    }),
    db.newProductEntry.findUnique({
      where: { childId_date: { childId: user.id, date } },
      include: { pointTransaction: true },
    }),
    db.newProductEntry.findMany({
      where: {
        childId: user.id,
        date: { gte: week.startsOn, lt: week.endsBefore },
      },
      include: { pointTransaction: true },
    }),
    db.reward.findFirst({
      where: { isActive: true },
      orderBy: [{ cost: "asc" }, { sortOrder: "asc" }],
    }),
  ]);

  const checksByType = new Map(checks.map((check) => [check.type, check]));
  const chorePoints = choreCompletions.filter(
    (completion) => completion.pointTransaction !== null,
  ).length;
  const weeklyProductPoints = weekProductEntries.filter(
    (entry) => entry.pointTransaction !== null,
  ).length;
  const confirmedToday =
    checks.reduce(
      (total, check) => total + (check.pointTransaction?.amount ?? 0),
      0,
    ) +
    choreCompletions.reduce(
      (total, completion) => total + (completion.pointTransaction?.amount ?? 0),
      0,
    ) +
    (newProductEntry?.pointTransaction?.amount ?? 0);
  const pendingChecks = checks.filter(
    (check) => check.status === ReviewStatus.PENDING,
  );
  const pendingChores = choreCompletions.filter(
    (completion) => completion.status === ReviewStatus.PENDING,
  );
  const pendingProduct = newProductEntry?.status === ReviewStatus.PENDING;
  const pendingCount =
    pendingChecks.length + pendingChores.length + (pendingProduct ? 1 : 0);
  const pendingDailyPoints = pendingChecks.reduce(
    (total, check) => total + DAILY_ITEM_DEFINITIONS[check.type].points,
    0,
  );
  const pendingChorePoints = Math.min(
    pendingChores.length,
    Math.max(0, MAX_CHORE_POINTS_PER_DAY - chorePoints),
  );
  const pendingProductPoints =
    pendingProduct && weeklyProductPoints < MAX_NEW_PRODUCT_POINTS_PER_WEEK
      ? 1
      : 0;
  const projectedPoints = Math.min(
    pendingDailyPoints + pendingChorePoints + pendingProductPoints,
    Math.max(0, user.pointBalanceLimit - balance),
  );

  return (
    <>
      <section className={styles.childHero} aria-labelledby="today-title">
        <p>Твой день</p>
        <h1 id="today-title">Сегодня</h1>
        <div className={styles.childStats}>
          <span><small>Начислено</small><strong>+{confirmedToday}</strong></span>
          <span><small>Ждёт взрослого</small><strong>{pendingCount}</strong></span>
        </div>
        {pendingCount > 0 ? (
          <p className={styles.heroHint}>
            После подтверждения — до +{projectedPoints} {pointsWord(projectedPoints)}
          </p>
        ) : null}
      </section>

      <section className={styles.compactList} aria-label="Отметки на сегодня">
        {dailyTypes.map((type) => {
          const definition = DAILY_ITEM_DEFINITIONS[type];
          const check = checksByType.get(type);
          return (
            <DailyCheckToggle
              key={`${type}-${check?.status ?? "EMPTY"}`}
              type={type}
              label={definition.label}
              description={definition.description}
              points={definition.points}
              awardedPoints={check?.pointTransaction?.amount ?? null}
              status={check?.status ?? null}
              rejectionReason={check?.rejectionReason ?? null}
            />
          );
        })}
        <Link className={styles.summaryLink} href="/?tab=chores">
          <span className={styles.rowIcon}><AppIcon name="home" /></span>
          <span>
            <strong>Помощь семье</strong>
            <small>
              {pendingChores.length > 0
                ? `${pendingChores.length} ждёт подтверждения`
                : "Выбери выполненные дела"}
            </small>
          </span>
          <AppIcon name="arrowRight" />
        </Link>
      </section>

      <section className={styles.productSection} aria-labelledby="product-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Знакомство с едой</p>
            <h2 id="product-title">Новый продукт · +1</h2>
          </div>
        </div>
        <NewProductForm
          key={`${newProductEntry?.id ?? "EMPTY"}-${newProductEntry?.status ?? "EMPTY"}`}
          name={newProductEntry?.name ?? ""}
          status={newProductEntry?.status ?? null}
          rejectionReason={newProductEntry?.rejectionReason ?? null}
          earnedPoint={newProductEntry?.pointTransaction !== null}
          weeklyPoints={weeklyProductPoints}
        />
      </section>

      {nearestReward ? (
        <Link className={styles.rewardShortcut} href="/?tab=rewards">
          <span>
            <small>
              {balance >= nearestReward.cost
                ? "Доступно сейчас"
                : `До награды ещё ${nearestReward.cost - balance}`}
            </small>
            <strong>{nearestReward.name}</strong>
          </span>
          <AppIcon name="arrowRight" />
        </Link>
      ) : null}
    </>
  );
}

async function ChildChores({ userId }: { userId: string }) {
  const date = databaseDateFromKey(getMoscowDateKey());
  const [chores, choreCompletions] = await Promise.all([
    db.chore.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.choreCompletion.findMany({
      where: { childId: userId, date },
      include: { pointTransaction: true },
    }),
  ]);
  const completionsByChoreId = new Map(
    choreCompletions.map((completion) => [completion.choreId, completion]),
  );
  const chorePoints = choreCompletions.filter(
    (completion) => completion.pointTransaction !== null,
  ).length;

  return (
    <section className={styles.childSection}>
      <div className={`${styles.sectionHeading} ${styles.childChoresHeading}`}>
        <div>
          <p className={styles.eyebrow}>Помощь семье</p>
          <h1>Домашние дела</h1>
        </div>
        <span className={styles.counter}>
          {chorePoints} из {MAX_CHORE_POINTS_PER_DAY}
        </span>
      </div>
      <p className={styles.sectionDescription}>
        Отмечай всё, что сделал. После двух баллов дела сохранятся без
        дополнительного начисления.
      </p>
      <div className={styles.choreList}>
        {chores.length === 0 ? (
          <p className={styles.emptyState}>Активных дел пока нет.</p>
        ) : (
          chores.map((chore) => {
            const completion = completionsByChoreId.get(chore.id);
            return (
              <ChoreToggle
                key={`${chore.id}-${completion?.status ?? "EMPTY"}`}
                choreId={chore.id}
                name={chore.name}
                instruction={chore.instruction}
                status={completion?.status ?? null}
                rejectionReason={completion?.rejectionReason ?? null}
                earnedPoint={completion?.pointTransaction !== null}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

export async function ChildInterface({
  user,
  requestedTab,
}: {
  user: ChildUser;
  requestedTab?: string;
}) {
  const activeTab = childTabs.some((tab) => tab.id === requestedTab)
    ? requestedTab!
    : "today";
  const balanceResult = await db.pointTransaction.aggregate({
    where: { userId: user.id },
    _sum: { amount: true },
  });
  const balance = balanceResult._sum.amount ?? 0;
  const dateKey = getMoscowDateKey();

  return (
    <div className={styles.childPage}>
      <SessionKeepAlive />
      <header className={styles.childTopbar}>
        <div>
          <small>{formatMoscowDate(dateKey)}</small>
          <strong>Привет, {user.displayName}!</strong>
        </div>
        <div className={styles.childTopActions}>
          <Link
            href="/?tab=rewards"
            className={styles.childBalance}
            aria-label={`Открыть награды. Баланс ${balance} ${pointsWord(balance)}`}
          >
            <small>Баланс</small>
            <strong>{balance} {pointsWord(balance)}</strong>
          </Link>
          <form action={logout}>
            <button className={styles.iconButton} type="submit" aria-label="Выйти">
              <AppIcon name="logout" />
            </button>
          </form>
        </div>
      </header>

      <main className={styles.childContent} id="main-content">
        {activeTab === "today" ? <ChildToday user={user} balance={balance} /> : null}
        {activeTab === "study" ? <StudySection canEdit={false} /> : null}
        {activeTab === "chores" ? <ChildChores userId={user.id} /> : null}
        {activeTab === "rewards" ? (
          <>
            <ChildRewardSection userId={user.id} balance={balance} />
            <PointHistory userId={user.id} canCorrect={false} />
          </>
        ) : null}
      </main>

      <RoleTabs tabs={childTabs} activeTab={activeTab} variant="bottom" />
    </div>
  );
}
