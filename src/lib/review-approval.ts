import "server-only";

import { PointReason, Prisma, ReviewStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  canAwardNewProduct,
  getMoscowWeekRange,
  selectChoreCompletionsForPoints,
} from "@/lib/domain/chores-and-products";
import { DAILY_ITEM_DEFINITIONS } from "@/lib/domain/daily-cycle";
import { sameIdSet, type SnapshotIds } from "@/lib/domain/review-snapshot";
import { createCappedEarning, lockAndGetPointBalance } from "@/lib/points";

export class PendingSnapshotChangedError extends Error {}

async function allocateChorePoints(
  transaction: Prisma.TransactionClient,
  childId: string,
  date: Date,
) {
  const completions = await transaction.choreCompletion.findMany({
    where: { childId, date },
    include: { pointTransaction: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const selectedIds = selectChoreCompletionsForPoints(
    completions.map((completion) => ({
      id: completion.id,
      status: completion.status,
      pointSlotProcessed:
        completion.pointTransaction !== null || completion.pointsProcessedAt !== null,
    })),
  );

  for (const completionId of selectedIds) {
    await createCappedEarning(transaction, {
      userId: childId,
      requestedAmount: 1,
      reason: PointReason.CHORE,
      source: { choreCompletionId: completionId },
    });
    await transaction.choreCompletion.update({
      where: { id: completionId },
      data: { pointsProcessedAt: new Date() },
    });
  }
}

export async function approveReviewSnapshot(
  snapshot: SnapshotIds,
  adultId: string,
): Promise<void> {
  const requestedCount =
    snapshot.checkIds.length + snapshot.completionIds.length + snapshot.entryIds.length;
  if (requestedCount === 0) return;

  await db.$transaction(async (transaction) => {
    const initialChecks = await transaction.dailyCheck.findMany({
      where: { id: { in: snapshot.checkIds } },
      select: { childId: true, date: true },
    });
    const initialChores = await transaction.choreCompletion.findMany({
      where: { id: { in: snapshot.completionIds } },
      select: { childId: true, date: true },
    });
    const initialProducts = await transaction.newProductEntry.findMany({
      where: { id: { in: snapshot.entryIds } },
      select: { childId: true, date: true },
    });
    const initial = [...initialChecks, ...initialChores, ...initialProducts];
    if (initial.length !== requestedCount) throw new PendingSnapshotChangedError();

    const childId = initial[0].childId;
    const dateTime = initial[0].date.getTime();
    if (initial.some((item) => item.childId !== childId || item.date.getTime() !== dateTime)) {
      throw new PendingSnapshotChangedError();
    }

    await lockAndGetPointBalance(transaction, childId);

    const [checks, chores, products] = await Promise.all([
      transaction.dailyCheck.findMany({
        where: { childId, date: initial[0].date, status: ReviewStatus.PENDING },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      transaction.choreCompletion.findMany({
        where: { childId, date: initial[0].date, status: ReviewStatus.PENDING },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      transaction.newProductEntry.findMany({
        where: { childId, date: initial[0].date, status: ReviewStatus.PENDING },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    ]);
    if (
      !sameIdSet(checks.map(({ id }) => id), snapshot.checkIds) ||
      !sameIdSet(chores.map(({ id }) => id), snapshot.completionIds) ||
      !sameIdSet(products.map(({ id }) => id), snapshot.entryIds)
    ) {
      throw new PendingSnapshotChangedError();
    }

    const decision = { status: ReviewStatus.APPROVED, decidedById: adultId, decidedAt: new Date(), rejectionReason: null };
    const dailyUpdate = await transaction.dailyCheck.updateMany({ where: { id: { in: snapshot.checkIds }, status: ReviewStatus.PENDING }, data: decision });
    const choreUpdate = await transaction.choreCompletion.updateMany({ where: { id: { in: snapshot.completionIds }, status: ReviewStatus.PENDING }, data: decision });
    const productUpdate = await transaction.newProductEntry.updateMany({ where: { id: { in: snapshot.entryIds }, status: ReviewStatus.PENDING }, data: decision });
    if (dailyUpdate.count !== checks.length || choreUpdate.count !== chores.length || productUpdate.count !== products.length) {
      throw new PendingSnapshotChangedError();
    }

    for (const check of checks) {
      const definition = DAILY_ITEM_DEFINITIONS[check.type];
      await createCappedEarning(transaction, {
        userId: childId,
        requestedAmount: definition.points,
        reason: definition.reason,
        source: { dailyCheckId: check.id },
      });
    }

    if (chores.length > 0) {
      await allocateChorePoints(transaction, childId, initial[0].date);
    }

    for (const product of products) {
      const week = getMoscowWeekRange(product.date.toISOString().slice(0, 10));
      const awardedThisWeek = await transaction.pointTransaction.count({
        where: {
          userId: childId,
          newProductEntry: { date: { gte: week.startsOn, lt: week.endsBefore } },
        },
      });
      if (canAwardNewProduct(awardedThisWeek)) {
        await createCappedEarning(transaction, {
          userId: childId,
          requestedAmount: 1,
          reason: PointReason.NEW_PRODUCT,
          source: { newProductEntryId: product.id },
        });
      }
    }
  });
}
