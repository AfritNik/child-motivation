import "server-only";

import { PointReason, RewardRequestStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { lockAndGetPointBalance } from "@/lib/points";

export type RewardDecisionResult = "ok" | "stale" | "balance";

export async function fulfillRewardRequestById(requestId: string, adultId: string): Promise<RewardDecisionResult> {
  return db.$transaction(async (transaction) => {
    const request = await transaction.rewardRequest.findFirst({ where: { id: requestId, status: RewardRequestStatus.PENDING } });
    if (!request) return "stale";
    const account = await lockAndGetPointBalance(transaction, request.userId);
    if (account.balance < request.cost) return "balance";
    const update = await transaction.rewardRequest.updateMany({
      where: { id: request.id, status: RewardRequestStatus.PENDING },
      data: { status: RewardRequestStatus.FULFILLED, decidedById: adultId, decidedAt: new Date() },
    });
    if (update.count !== 1) return "stale";
    await transaction.pointTransaction.create({
      data: { userId: request.userId, rewardRequestId: request.id, amount: -request.cost, reason: PointReason.REWARD },
    });
    return "ok";
  });
}

export async function cancelRewardRequestById(requestId: string, adultId: string): Promise<"ok" | "stale"> {
  const update = await db.rewardRequest.updateMany({
    where: { id: requestId, status: RewardRequestStatus.PENDING },
    data: { status: RewardRequestStatus.CANCELLED, decidedById: adultId, decidedAt: new Date() },
  });
  return update.count === 1 ? "ok" : "stale";
}
