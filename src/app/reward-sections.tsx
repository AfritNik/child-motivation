import { RewardRequestStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  cancelOwnRewardRequest,
  cancelRewardRequest,
  fulfillRewardRequest,
  grantRewardDirectly,
  requestReward,
} from "./reward-actions";
import { FormSubmitButton } from "./form-submit-button";
import { ConfirmActionDialog } from "./action-dialog";
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

function statusText(status: RewardRequestStatus, selfCancelled = false): string {
  if (status === RewardRequestStatus.PENDING) return "Ожидает решения";
  if (status === RewardRequestStatus.FULFILLED) return "Награда получена";
  return selfCancelled ? "Отменено Сашей" : "Отменено взрослым";
}

export async function ChildRewardSection({
  userId,
  balance,
}: {
  userId: string;
  balance: number;
}) {
  const [rewards, pendingRequests, decidedRequests] = await Promise.all([
    db.reward.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.rewardRequest.findMany({
      where: { userId, status: RewardRequestStatus.PENDING },
      include: { reward: true },
      orderBy: { createdAt: "desc" },
    }),
    db.rewardRequest.findMany({
      where: { userId, status: { not: RewardRequestStatus.PENDING } },
      include: { reward: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const requests = [...pendingRequests, ...decidedRequests];
  const pendingRewardIds = new Set(
    pendingRequests.map((request) => request.rewardId),
  );

  return (
    <section className={styles.childSection}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Обмен баллов</p>
          <h1>Награды</h1>
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
                <FormSubmitButton
                  disabled={!hasEnoughPoints || alreadyPending}
                  pendingLabel="Отправляю…"
                >
                  {alreadyPending
                    ? "Уже ожидает решения"
                    : hasEnoughPoints
                      ? "Запросить"
                      : `Не хватает ${reward.cost - balance} б.`}
                </FormSubmitButton>
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
                {statusText(request.status, request.decidedById === null)}
              </strong>
              <small>
                {request.cost} б. · {formatRequestDate(request.createdAt)}
              </small>
              {request.status === RewardRequestStatus.PENDING ? (
                <form action={cancelOwnRewardRequest}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <FormSubmitButton
                    className={styles.cancelRequestButton}
                    pendingLabel="Отменяю…"
                  >
                    Отменить запрос
                  </FormSubmitButton>
                </form>
              ) : null}
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
  const [rewards, pendingRequests, decidedRequests] = await Promise.all([
    db.reward.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.rewardRequest.findMany({
      where: { userId: childId, status: RewardRequestStatus.PENDING },
      include: {
        reward: true,
        decidedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.rewardRequest.findMany({
      where: {
        userId: childId,
        status: { not: RewardRequestStatus.PENDING },
      },
      include: {
        reward: true,
        decidedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <section className={styles.reviewSection}>
      <div className={styles.adultSectionHeading}>
        <h1>Награды</h1>
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
                  {hasEnoughPoints ? (
                    <ConfirmActionDialog
                      action={fulfillRewardRequest}
                      fields={[{ name: "requestId", value: request.id }]}
                      triggerLabel="Выдана"
                      title="Выдать награду?"
                      description={`${request.reward.name}. Баланс: ${balance} → ${balance - request.cost}. Будет списано ${request.cost} баллов.`}
                      confirmLabel="Выдать и списать"
                    />
                  ) : (
                    <button type="button" disabled>Недостаточно баллов</button>
                  )}
                  <ConfirmActionDialog
                    action={cancelRewardRequest}
                    fields={[{ name: "requestId", value: request.id }]}
                    triggerLabel="Отменено"
                    title="Отменить запрос?"
                    description={`${request.reward.name}. Баланс не изменится, запрос будет закрыт.`}
                    confirmLabel="Отменить запрос"
                    triggerClassName={styles.cancelButton}
                  />
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
              {balance >= reward.cost ? (
                <ConfirmActionDialog
                  action={grantRewardDirectly}
                  fields={[{ name: "rewardId", value: reward.id }]}
                  triggerLabel="Выдать"
                  title="Выдать награду напрямую?"
                  description={`${reward.name}. Баланс: ${balance} → ${balance - reward.cost}. Будет списано ${reward.cost} баллов.`}
                  confirmLabel="Выдать и списать"
                />
              ) : (
                <button type="button" disabled>
                  Не хватает {reward.cost - balance} б.
                </button>
              )}
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
                {statusText(request.status, request.decidedById === null)}
              </strong>
              <small>
                {request.cost} б. · {request.decidedBy?.displayName ??
                  (request.status === RewardRequestStatus.CANCELLED
                    ? "Отменено ребёнком"
                    : "Взрослый")}
              </small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
