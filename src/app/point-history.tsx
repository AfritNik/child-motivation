import { DailyCheckType, PointReason } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { PointCorrectionForm } from "./point-correction-form";
import styles from "./page.module.css";

function formatTransactionDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date);
}

function formatSourceDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function transactionDescription(transaction: {
  reason: PointReason;
  dailyCheck: { type: DailyCheckType } | null;
  choreCompletion: { chore: { name: string } } | null;
  newProductEntry: { name: string } | null;
  rewardRequest: { reward: { name: string } } | null;
  pointCorrection: { note: string; createdBy: { displayName: string } } | null;
}): string {
  if (transaction.pointCorrection) {
    return `${transaction.pointCorrection.note} · ${transaction.pointCorrection.createdBy.displayName}`;
  }
  if (transaction.dailyCheck?.type === DailyCheckType.SELF_DIRECTED_STUDY) {
    return "Самостоятельные уроки";
  }
  if (transaction.dailyCheck?.type === DailyCheckType.PERSONAL_ROUTINE) {
    return "Личная рутина и порядок";
  }
  if (transaction.choreCompletion) return transaction.choreCompletion.chore.name;
  if (transaction.newProductEntry) {
    return `Новый продукт: ${transaction.newProductEntry.name}`;
  }
  if (transaction.rewardRequest) {
    return `Награда: ${transaction.rewardRequest.reward.name}`;
  }
  return "Операция с баллами";
}

export async function PointHistory({
  userId,
  canCorrect,
  currentBalance,
  balanceLimit,
}: {
  userId: string;
  canCorrect: boolean;
  currentBalance?: number;
  balanceLimit?: number;
}) {
  const transactions = await db.pointTransaction.findMany({
    where: { userId },
    include: {
      dailyCheck: true,
      choreCompletion: { include: { chore: true } },
      newProductEntry: true,
      rewardRequest: { include: { reward: true } },
      pointCorrection: {
        include: { createdBy: { select: { displayName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <section className={styles.historySection}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Прозрачный баланс</p>
          <h2>История баллов</h2>
        </div>
      </div>
      {canCorrect && currentBalance !== undefined && balanceLimit !== undefined ? <PointCorrectionForm currentBalance={currentBalance} balanceLimit={balanceLimit} /> : null}
      <div className={styles.pointHistoryList}>
        {transactions.length === 0 ? (
          <p className={styles.emptyState}>Операций пока нет.</p>
        ) : (
          transactions.map((transaction) => (
            <div key={transaction.id} className={styles.pointHistoryItem}>
              <div>
                <strong>{transactionDescription(transaction)}</strong>
                <small>
                  {transaction.dailyCheck?.date || transaction.choreCompletion?.date || transaction.newProductEntry?.date
                    ? `за ${formatSourceDate(transaction.dailyCheck?.date ?? transaction.choreCompletion?.date ?? transaction.newProductEntry!.date)} · решено ${formatTransactionDate(transaction.createdAt)}`
                    : formatTransactionDate(transaction.createdAt)}
                </small>
              </div>
              <b data-sign={transaction.amount > 0 ? "positive" : "negative"}>
                {transaction.amount > 0 ? "+" : ""}{transaction.amount}
              </b>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
