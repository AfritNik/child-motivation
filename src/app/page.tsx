import {
  AccessRole,
  DailyCheckType,
  ReviewStatus,
} from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
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
import { ChoreToggle } from "./chore-toggle";
import {
  approveChoreCompletions,
  approveNewProduct,
  rejectChoreCompletion,
  rejectNewProduct,
} from "./chores-products-actions";
import { approveDailyChecks, rejectDailyCheck } from "./daily-actions";
import { DailyCheckToggle } from "./daily-check-toggle";
import { LoginForm } from "./login-form";
import { NewProductForm } from "./new-product-form";
import { OverdueSection } from "./overdue-section";
import { PointHistory } from "./point-history";
import { AdultRewardSection, ChildRewardSection } from "./reward-sections";
import { RoleTabs } from "./role-tabs";
import { SessionKeepAlive } from "./session-keep-alive";
import { StudySection } from "./study-section";
import styles from "./page.module.css";

const roleNames: Record<AccessRole, string> = {
  [AccessRole.CHILD]: "детский режим",
  [AccessRole.ADMIN]: "администратор",
  [AccessRole.ADULT]: "взрослый режим",
};

const dailyTypes = [
  DailyCheckType.SELF_DIRECTED_STUDY,
  DailyCheckType.PERSONAL_ROUTINE,
] as const;

function LogoutButton() {
  return (
    <form action={logout} className={styles.logoutForm}>
      <button type="submit" className={styles.secondaryButton}>
        Выйти
      </button>
    </form>
  );
}

const childTabs = [
  { id: "today", label: "Сегодня", icon: "✓" },
  { id: "study", label: "Учёба", icon: "А" },
  { id: "chores", label: "Обязанности", icon: "⌂" },
  { id: "rewards", label: "Награды", icon: "★" },
] as const;

const adultTabs = [
  { id: "review", label: "Проверка", icon: "✓" },
  { id: "study", label: "Учёба", icon: "А" },
  { id: "rewards", label: "Награды", icon: "★" },
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; overdue?: string }>;
}) {
  const user = await getCurrentUser();
  const resolvedSearchParams = await searchParams;
  const requestedTab = resolvedSearchParams.tab;
  const requestedOverdueDays = Number(resolvedSearchParams.overdue ?? 5);
  const visibleOverdueDays = Number.isInteger(requestedOverdueDays)
    ? Math.min(20, Math.max(5, requestedOverdueDays))
    : 5;

  if (!user) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <p className={styles.eyebrow}>Семейная система</p>
          <h1>Кто входит?</h1>
          <p className={styles.description}>
            Введите свой четырёхзначный PIN. Имя выбирать не нужно.
          </p>
          <LoginForm />
        </main>
      </div>
    );
  }

  const dateKey = getMoscowDateKey();
  const date = databaseDateFromKey(dateKey);
  const week = getMoscowWeekRange(dateKey);

  if (user.role === AccessRole.CHILD) {
    const childTab = childTabs.some((tab) => tab.id === requestedTab)
      ? requestedTab!
      : "today";
    const [
      checks,
      chores,
      choreCompletions,
      newProductEntry,
      weekProductEntries,
      balanceResult,
    ] = await Promise.all([
      db.dailyCheck.findMany({
        where: { childId: user.id, date },
        include: { pointTransaction: true },
      }),
      db.chore.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      db.choreCompletion.findMany({
        where: { childId: user.id, date },
        include: { pointTransaction: true },
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
      db.pointTransaction.aggregate({
        where: { userId: user.id },
        _sum: { amount: true },
      }),
    ]);
    const checksByType = new Map(checks.map((check) => [check.type, check]));
    const completionsByChoreId = new Map(
      choreCompletions.map((completion) => [completion.choreId, completion]),
    );
    const chorePoints = choreCompletions.filter(
      (completion) => completion.pointTransaction !== null,
    ).length;
    const weeklyProductPoints = weekProductEntries.filter(
      (entry) => entry.pointTransaction !== null,
    ).length;

    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <SessionKeepAlive />
          <p className={styles.eyebrow}>{formatMoscowDate(dateKey)}</p>
          <div className={styles.titleRow}>
            <h1>Привет, {user.displayName}!</h1>
            <span className={styles.balance}>
              {balanceResult._sum.amount ?? 0} / {user.pointBalanceLimit} б.
            </span>
          </div>
          <p className={styles.description}>
            Отмечай только то, что уже сделал. Каждая отметка сохраняется сразу.
          </p>
          <RoleTabs tabs={childTabs} activeTab={childTab} />
          {childTab === "today" ? (
          <section className={styles.dailyList} aria-label="Ежедневные пункты">
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
          </section>
          ) : null}

          {childTab === "chores" ? (
          <section className={styles.childSection}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Помощь семье</p>
                <h2>Домашние дела</h2>
              </div>
              <span className={styles.counter}>
                {chorePoints} из {MAX_CHORE_POINTS_PER_DAY} баллов
              </span>
            </div>
            <p className={styles.sectionDescription}>
              Можно выполнить сколько угодно дел, но получить не больше двух
              баллов за день.
            </p>
            <div className={styles.choreList}>
              {chores.map((chore) => {
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
              })}
            </div>
          </section>
          ) : null}

          {childTab === "today" ? (
          <section className={styles.childSection}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Знакомство с едой</p>
                <h2>Новый продукт · +1</h2>
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
          ) : null}
          {childTab === "today" ? (
            <PointHistory userId={user.id} canCorrect={false} />
          ) : null}
          {childTab === "study" ? <StudySection canEdit={false} /> : null}
          {childTab === "rewards" ? (
            <ChildRewardSection
              userId={user.id}
              balance={balanceResult._sum.amount ?? 0}
            />
          ) : null}
          <LogoutButton />
        </main>
      </div>
    );
  }

  const child = await db.user.findFirst({
    where: { role: AccessRole.CHILD, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, displayName: true, pointBalanceLimit: true },
  });

  if (!child) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <SessionKeepAlive />
          <h1>Детский аккаунт не найден</h1>
          <LogoutButton />
        </main>
      </div>
    );
  }

  const [
    checks,
    choreCompletions,
    newProductEntry,
    weekProductEntries,
    balanceResult,
  ] = await Promise.all([
    db.dailyCheck.findMany({
      where: { childId: child.id, date },
      include: {
        decidedBy: { select: { displayName: true } },
        pointTransaction: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.choreCompletion.findMany({
      where: { childId: child.id, date },
      include: {
        chore: true,
        decidedBy: { select: { displayName: true } },
        pointTransaction: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.newProductEntry.findUnique({
      where: { childId_date: { childId: child.id, date } },
      include: {
        decidedBy: { select: { displayName: true } },
        pointTransaction: true,
      },
    }),
    db.newProductEntry.findMany({
      where: {
        childId: child.id,
        date: { gte: week.startsOn, lt: week.endsBefore },
      },
      include: { pointTransaction: true },
    }),
    db.pointTransaction.aggregate({
      where: { userId: child.id },
      _sum: { amount: true },
    }),
  ]);
  const pendingChecks = checks.filter(
    (check) => check.status === ReviewStatus.PENDING,
  );
  const decidedChecks = checks.filter(
    (check) => check.status !== ReviewStatus.PENDING,
  );
  const pendingChores = choreCompletions.filter(
    (completion) => completion.status === ReviewStatus.PENDING,
  );
  const decidedChores = choreCompletions.filter(
    (completion) => completion.status !== ReviewStatus.PENDING,
  );
  const chorePoints = choreCompletions.filter(
    (completion) => completion.pointTransaction !== null,
  ).length;
  const weeklyProductPoints = weekProductEntries.filter(
    (entry) => entry.pointTransaction !== null,
  ).length;
  const pendingProduct =
    newProductEntry?.status === ReviewStatus.PENDING ? newProductEntry : null;
  const decidedProduct =
    newProductEntry && newProductEntry.status !== ReviewStatus.PENDING
      ? newProductEntry
      : null;
  const pendingTotal =
    pendingChecks.length + pendingChores.length + (pendingProduct ? 1 : 0);
  const adultTab = adultTabs.some((tab) => tab.id === requestedTab)
    ? requestedTab!
    : "review";

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <SessionKeepAlive />
        <p className={styles.eyebrow}>{formatMoscowDate(dateKey)}</p>
        <div className={styles.titleRow}>
          <h1>Привет, {user.displayName}!</h1>
          <span className={styles.balance}>
            {balanceResult._sum.amount ?? 0} / {child.pointBalanceLimit} б.
          </span>
        </div>
        <p className={styles.description}>
          {roleNames[user.role]}. Сегодня у {child.displayName}: {pendingTotal}{" "}
          ожидает подтверждения.
        </p>
        <RoleTabs tabs={adultTabs} activeTab={adultTab} />

        {adultTab === "review" ? (
          <>
        <OverdueSection
          childId={child.id}
          balance={balanceResult._sum.amount ?? 0}
          balanceLimit={child.pointBalanceLimit}
          visibleDays={visibleOverdueDays}
        />
        <section className={styles.reviewSection}>
          <h2>Ежедневные пункты</h2>
          {pendingChecks.length === 0 ? (
            <p className={styles.emptyState}>Новых отметок пока нет.</p>
          ) : (
            <>
              {pendingChecks.length > 1 ? (
                <form action={approveDailyChecks}>
                  {pendingChecks.map((check) => (
                    <input
                      key={check.id}
                      type="hidden"
                      name="checkId"
                      value={check.id}
                    />
                  ))}
                  <button type="submit" className={styles.primaryButton}>
                    Подтвердить всё отмеченное
                  </button>
                </form>
              ) : null}
              <div className={styles.reviewList}>
                {pendingChecks.map((check) => {
                  const definition = DAILY_ITEM_DEFINITIONS[check.type];

                  return (
                    <article key={check.id} className={styles.reviewCard}>
                      <div className={styles.reviewTitle}>
                        <div>
                          <h3>{definition.label}</h3>
                          <p>
                            До +{definition.points} баллов, баланс не выше{" "}
                            {child.pointBalanceLimit}
                          </p>
                        </div>
                        <form action={approveDailyChecks}>
                          <input type="hidden" name="checkId" value={check.id} />
                          <button type="submit" className={styles.approveButton}>
                            Подтвердить
                          </button>
                        </form>
                      </div>
                      <form action={rejectDailyCheck} className={styles.rejectForm}>
                        <input type="hidden" name="checkId" value={check.id} />
                        <label htmlFor={`reason-${check.id}`}>Причина отклонения</label>
                        <div>
                          <input
                            id={`reason-${check.id}`}
                            name="rejectionReason"
                            minLength={2}
                            maxLength={200}
                            required
                            placeholder="Коротко объяснить"
                          />
                          <button type="submit">Отклонить</button>
                        </div>
                      </form>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className={styles.reviewSection}>
          <div className={styles.sectionHeading}>
            <h2>Домашние дела</h2>
            <span className={styles.counter}>
              {chorePoints} из {MAX_CHORE_POINTS_PER_DAY} баллов
            </span>
          </div>
          {pendingChores.length === 0 ? (
            <p className={styles.emptyState}>Новых выполненных дел пока нет.</p>
          ) : (
            <>
              {pendingChores.length > 1 ? (
                <form action={approveChoreCompletions}>
                  {pendingChores.map((completion) => (
                    <input
                      key={completion.id}
                      type="hidden"
                      name="completionId"
                      value={completion.id}
                    />
                  ))}
                  <button type="submit" className={styles.primaryButton}>
                    Подтвердить все дела
                  </button>
                </form>
              ) : null}
              <div className={styles.reviewList}>
                {pendingChores.map((completion, index) => {
                  const willEarnPoint =
                    index < MAX_CHORE_POINTS_PER_DAY - chorePoints;

                  return (
                    <article key={completion.id} className={styles.reviewCard}>
                      <div className={styles.reviewTitle}>
                        <div>
                          <h3>{completion.chore.name}</h3>
                          <p>
                            {(balanceResult._sum.amount ?? 0) >=
                            child.pointBalanceLimit
                              ? `Будет подтверждено без балла: баланс ${child.pointBalanceLimit}`
                              : willEarnPoint
                              ? "После подтверждения: +1 балл"
                              : "Будет подтверждено без балла: дневной лимит"}
                          </p>
                        </div>
                        <form action={approveChoreCompletions}>
                          <input
                            type="hidden"
                            name="completionId"
                            value={completion.id}
                          />
                          <button type="submit" className={styles.approveButton}>
                            Подтвердить
                          </button>
                        </form>
                      </div>
                      <form
                        action={rejectChoreCompletion}
                        className={styles.rejectForm}
                      >
                        <input
                          type="hidden"
                          name="completionId"
                          value={completion.id}
                        />
                        <label htmlFor={`chore-reason-${completion.id}`}>
                          Причина отклонения
                        </label>
                        <div>
                          <input
                            id={`chore-reason-${completion.id}`}
                            name="rejectionReason"
                            minLength={2}
                            maxLength={200}
                            required
                            placeholder="Коротко объяснить"
                          />
                          <button type="submit">Отклонить</button>
                        </div>
                      </form>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className={styles.reviewSection}>
          <div className={styles.sectionHeading}>
            <h2>Новый продукт</h2>
            <span className={styles.counter}>
              {weeklyProductPoints} из {MAX_NEW_PRODUCT_POINTS_PER_WEEK} за неделю
            </span>
          </div>
          {!pendingProduct ? (
            <p className={styles.emptyState}>Новой записи сегодня нет.</p>
          ) : (
            <article className={styles.reviewCard}>
              <div className={styles.reviewTitle}>
                <div>
                  <h3>{pendingProduct.name}</h3>
                  <p>
                    {(balanceResult._sum.amount ?? 0) >= child.pointBalanceLimit
                      ? `Будет подтверждено без балла: баланс ${child.pointBalanceLimit}`
                      : weeklyProductPoints < MAX_NEW_PRODUCT_POINTS_PER_WEEK
                      ? "После подтверждения: +1 балл"
                      : "Будет подтверждено без балла: недельный лимит"}
                  </p>
                </div>
                <form action={approveNewProduct}>
                  <input type="hidden" name="entryId" value={pendingProduct.id} />
                  <button type="submit" className={styles.approveButton}>
                    Подтвердить
                  </button>
                </form>
              </div>
              <form action={rejectNewProduct} className={styles.rejectForm}>
                <input type="hidden" name="entryId" value={pendingProduct.id} />
                <label htmlFor={`product-reason-${pendingProduct.id}`}>
                  Причина отклонения
                </label>
                <div>
                  <input
                    id={`product-reason-${pendingProduct.id}`}
                    name="rejectionReason"
                    minLength={2}
                    maxLength={200}
                    required
                    placeholder="Коротко объяснить"
                  />
                  <button type="submit">Отклонить</button>
                </div>
              </form>
            </article>
          )}
        </section>

        {decidedChecks.length > 0 ||
        decidedChores.length > 0 ||
        decidedProduct ? (
          <section className={styles.reviewSection}>
            <h2>Решено сегодня</h2>
            <div className={styles.decidedList}>
              {decidedChecks.map((check) => {
                const definition = DAILY_ITEM_DEFINITIONS[check.type];
                const approved = check.status === ReviewStatus.APPROVED;

                return (
                  <div key={check.id} className={styles.decidedItem}>
                    <span>{definition.label}</span>
                    <strong>
                      {approved
                        ? check.pointTransaction
                          ? `Подтверждено · +${check.pointTransaction.amount}`
                          : "Подтверждено · без начисления"
                        : `Отклонено · ${check.rejectionReason}`}
                    </strong>
                    <small>{check.decidedBy?.displayName}</small>
                  </div>
                );
              })}
              {decidedChores.map((completion) => (
                <div key={completion.id} className={styles.decidedItem}>
                  <span>{completion.chore.name}</span>
                  <strong>
                    {completion.status === ReviewStatus.APPROVED
                      ? completion.pointTransaction
                        ? "Подтверждено · +1"
                        : "Подтверждено · без балла"
                      : `Отклонено · ${completion.rejectionReason}`}
                  </strong>
                  <small>{completion.decidedBy?.displayName}</small>
                </div>
              ))}
              {decidedProduct ? (
                <div className={styles.decidedItem}>
                  <span>Новый продукт: {decidedProduct.name}</span>
                  <strong>
                    {decidedProduct.status === ReviewStatus.APPROVED
                      ? decidedProduct.pointTransaction
                        ? "Подтверждено · +1"
                        : "Подтверждено · без балла"
                      : `Отклонено · ${decidedProduct.rejectionReason}`}
                  </strong>
                  <small>{decidedProduct.decidedBy?.displayName}</small>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
        <PointHistory
          userId={child.id}
          canCorrect={user.role === AccessRole.ADMIN}
        />
          </>
        ) : null}
        {adultTab === "study" ? (
          <StudySection canEdit={user.role === AccessRole.ADMIN} />
        ) : null}
        {adultTab === "rewards" ? (
          <AdultRewardSection
            childId={child.id}
            balance={balanceResult._sum.amount ?? 0}
          />
        ) : null}
        <LogoutButton />
      </main>
    </div>
  );
}
