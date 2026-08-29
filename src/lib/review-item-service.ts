import "server-only";

import { PointReason, Prisma, ReviewStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { canAwardNewProduct, getMoscowWeekRange, selectChoreCompletionsForPoints } from "@/lib/domain/chores-and-products";
import { createCappedEarning, lockAndGetPointBalance } from "@/lib/points";

async function allocateChorePoints(transaction: Prisma.TransactionClient, childId: string, date: Date) {
  const completions = await transaction.choreCompletion.findMany({
    where: { childId, date },
    include: { pointTransaction: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const selectedIds = selectChoreCompletionsForPoints(completions.map((completion) => ({
    id: completion.id,
    status: completion.status,
    pointSlotProcessed: completion.pointTransaction !== null || completion.pointsProcessedAt !== null,
  })));
  for (const completionId of selectedIds) {
    await createCappedEarning(transaction, {
      userId: childId,
      requestedAmount: 1,
      reason: PointReason.CHORE,
      source: { choreCompletionId: completionId },
    });
    await transaction.choreCompletion.update({ where: { id: completionId }, data: { pointsProcessedAt: new Date() } });
  }
}

export async function approveChoreCompletionById(completionId: string, adultId: string): Promise<boolean> {
  return db.$transaction(async (transaction) => {
    const completion = await transaction.choreCompletion.findFirst({
      where: { id: completionId, status: ReviewStatus.PENDING },
      select: { id: true, childId: true, date: true },
    });
    if (!completion) return false;
    await lockAndGetPointBalance(transaction, completion.childId);
    const update = await transaction.choreCompletion.updateMany({
      where: { id: completion.id, status: ReviewStatus.PENDING },
      data: { status: ReviewStatus.APPROVED, decidedById: adultId, decidedAt: new Date(), rejectionReason: null },
    });
    if (update.count !== 1) return false;
    await allocateChorePoints(transaction, completion.childId, completion.date);
    return true;
  });
}

export async function rejectChoreCompletionById(
  completionId: string,
  adultId: string,
  rejectionReason: string,
): Promise<boolean> {
  return db.$transaction(async (transaction) => {
    const completion = await transaction.choreCompletion.findFirst({
      where: { id: completionId, status: ReviewStatus.PENDING },
      select: { id: true, childId: true, date: true },
    });
    if (!completion) return false;
    await lockAndGetPointBalance(transaction, completion.childId);
    const update = await transaction.choreCompletion.updateMany({
      where: { id: completion.id, status: ReviewStatus.PENDING },
      data: { status: ReviewStatus.REJECTED, decidedById: adultId, decidedAt: new Date(), rejectionReason },
    });
    if (update.count !== 1) return false;
    await allocateChorePoints(transaction, completion.childId, completion.date);
    return true;
  });
}

export async function approveNewProductById(entryId: string, adultId: string): Promise<boolean> {
  return db.$transaction(async (transaction) => {
    const entry = await transaction.newProductEntry.findFirst({ where: { id: entryId, status: ReviewStatus.PENDING } });
    if (!entry) return false;
    const week = getMoscowWeekRange(entry.date.toISOString().slice(0, 10));
    await lockAndGetPointBalance(transaction, entry.childId);
    const update = await transaction.newProductEntry.updateMany({
      where: { id: entry.id, status: ReviewStatus.PENDING },
      data: { status: ReviewStatus.APPROVED, decidedById: adultId, decidedAt: new Date(), rejectionReason: null },
    });
    if (update.count !== 1) return false;
    const awardedThisWeek = await transaction.pointTransaction.count({
      where: { userId: entry.childId, newProductEntry: { date: { gte: week.startsOn, lt: week.endsBefore } } },
    });
    if (canAwardNewProduct(awardedThisWeek)) {
      await createCappedEarning(transaction, {
        userId: entry.childId,
        requestedAmount: 1,
        reason: PointReason.NEW_PRODUCT,
        source: { newProductEntryId: entry.id },
      });
    }
    return true;
  });
}
