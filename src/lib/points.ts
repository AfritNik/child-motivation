import "server-only";

import { PointReason, Prisma } from "@/generated/prisma/client";
import { calculateCappedEarning } from "@/lib/domain/points";

type PointSource =
  | { dailyCheckId: string }
  | { choreCompletionId: string }
  | { newProductEntryId: string };

export async function lockAndGetPointBalance(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<{ balance: number; limit: number }> {
  const user = await transaction.user.findUnique({
    where: { id: userId },
    select: { pointBalanceLimit: true },
  });

  if (!user) {
    throw new Error("Point account user not found");
  }

  await transaction.user.update({
    where: { id: userId },
    data: { pointBalanceLimit: user.pointBalanceLimit },
  });

  const result = await transaction.pointTransaction.aggregate({
    where: { userId },
    _sum: { amount: true },
  });

  return {
    balance: result._sum.amount ?? 0,
    limit: user.pointBalanceLimit,
  };
}

export async function createCappedEarning(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    requestedAmount: number;
    reason: PointReason;
    source: PointSource;
  },
) {
  const account = await lockAndGetPointBalance(transaction, input.userId);
  const amount = calculateCappedEarning(
    account.balance,
    account.limit,
    input.requestedAmount,
  );

  if (amount === 0) {
    return null;
  }

  return transaction.pointTransaction.create({
    data: {
      userId: input.userId,
      amount,
      reason: input.reason,
      ...input.source,
    },
  });
}
