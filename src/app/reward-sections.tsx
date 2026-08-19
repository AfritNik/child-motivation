import { RewardRequestStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  cancelRewardRequest,
  fulfillRewardRequest,
  grantRewardDirectly,
  requestReward,
} from "./reward-actions";
import styles from "./page.module.css";

function formatRequestDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function statusText(status: RewardRequestStatus): string {
  if (status === RewardRequestStatus.PENDING) return "Ожидает решения";
  if (status === RewardRequestStatus.FULFILLED) return "Награда получена";
  return "Отменено";
}

export async function ChildRewardSection({
  userId,
  balance,
}: {
  userId: string;
  balance: number;
}) {
  const [rewards, requests] = await Promise.all([
    db.reward.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.rewardRequest.findMany({
      where: { userId },
      include: { reward: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const pendingRewardIds = new Set(
    requests
      .filter((request) => request.status === RewardRequestStatus.PENDING)
      .map((request) => request.rewardId),
  );

  return (
    <section className={styles.childSection}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Обмен баллов</p>
          <h2>Награды</h2>
        </div>
      </div>
      <p className={styles.sectionDescription}>
        Запрос не списывает баллы. Списание происходит только после решения
        взрослого.
      </p>
      <div className={styles.rewardGrid}>
        {rewards.map((reward) => {
          const hasEnoughPoints = balance >= reward.cost;
          const alreadyPending = pendingRewardIds.has(reward.id);

          return (
            <article key={reward.id} className={styles.rewardCard}>
              <div className={styles.rewardTitle}>
                <h3>{reward.name}</h3>
                <strong>{reward.cost} б.</strong>
              </div>
              <p>{reward.description}</p>
              <form action={requestReward}>
                <input type="hidden" name="rewardId" value={reward.id} />
                <button
                  type="submit"
                  disabled={!hasEnoughPoints || alreadyPending}
                >
                  {alreadyPending
                    ? "Уже ожидает решения"
                    : hasEnoughPoints
                      ? "Запросить"
                      : `Не хватает ${reward.cost - balance} б.`}
                </button>
              </form>
            </article>
          );
        })}
      </div>

      {requests.length > 0 ? (
        <div className={styles.rewardHistory}>
          <h3>Мои запросы</h3>
          {requests.map((request) => (
            <div key={request.id} className={styles.rewardHistoryItem}>
              <span>{request.reward.name}</span>
              <strong data-status={request.status}>
                {statusText(request.status)}
              </strong>
              <small>
                {request.cost} б. · {formatRequestDate(request.createdAt)}
              </small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export async function AdultRewardSection({
  childId,
  balance,
}: {
  childId: string;
  balance: number;
}) {
  const [rewards, requests] = await Promise.all([
    db.reward.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.rewardRequest.findMany({
      where: { userId: childId },
      include: {
        reward: true,
        decidedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const pendingRequests = requests.filter(
    (request) => request.status === RewardRequestStatus.PENDING,
  );
  const decidedRequests = requests.filter(
    (request) => request.status !== RewardRequestStatus.PENDING,
  );

  return (
    <section className={styles.reviewSection}>
      <div className={styles.sectionHeading}>
        <h2>Награды</h2>
        <span className={styles.counter}>{balance} баллов доступно</span>
      </div>

      <div className={styles.rewardHistory}>
        <h3>Ожидают решения</h3>
        {pendingRequests.length === 0 ? (
          <p className={styles.emptyState}>Запросов на награды пока нет.</p>
        ) : (
          pendingRequests.map((request) => {
            const hasEnoughPoints = balance >= request.cost;

            return (
              <article key={request.id} className={styles.rewardDecisionCard}>
                <div>
                  <h3>{request.reward.name}</h3>
                  <p>{request.reward.description}</p>
                  <small>
                    Цена запроса: {request.cost} б. ·{" "}
                    {formatRequestDate(request.createdAt)}
                  </small>
                </div>
                <div className={styles.rewardActions}>
                  <form action={fulfillRewardRequest}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <button type="submit" disabled={!hasEnoughPoints}>
                      {hasEnoughPoints ? "Выдана" : "Недостаточно баллов"}
                    </button>
                  </form>
                  <form action={cancelRewardRequest}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <button type="submit" className={styles.cancelButton}>
                      Отменить
                    </button>
                  </form>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className={styles.rewardHistory}>
        <h3>Выдать напрямую</h3>
        <div className={styles.rewardGrid}>
          {rewards.map((reward) => (
            <article key={reward.id} className={styles.rewardCard}>
              <div className={styles.rewardTitle}>
                <h3>{reward.name}</h3>
                <strong>{reward.cost} б.</strong>
              </div>
              <p>{reward.description}</p>
              <form action={grantRewardDirectly}>
                <input type="hidden" name="rewardId" value={reward.id} />
                <button type="submit" disabled={balance < reward.cost}>
                  {balance >= reward.cost
                    ? "Выдать"
                    : `Не хватает ${reward.cost - balance} б.`}
                </button>
              </form>
            </article>
          ))}
        </div>
      </div>

      {decidedRequests.length > 0 ? (
        <div className={styles.rewardHistory}>
          <h3>История</h3>
          {decidedRequests.map((request) => (
            <div key={request.id} className={styles.rewardHistoryItem}>
              <span>{request.reward.name}</span>
              <strong data-status={request.status}>
                {statusText(request.status)}
              </strong>
              <small>
                {request.cost} б. · {request.decidedBy?.displayName ?? "Взрослый"}
              </small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
