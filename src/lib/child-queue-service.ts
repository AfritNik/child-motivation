import "server-only";

import { ReviewStatus, type DailyCheckType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { lockAndGetPointBalance } from "@/lib/points";

export type ChildQueueMutationResult = { ok: true } | { ok: false; error: string };

export async function setDailyCheckForChild(
  childId: string,
  date: Date,
  type: DailyCheckType,
  checked: boolean,
): Promise<ChildQueueMutationResult> {
  return db.$transaction(async (transaction) => {
    await lockAndGetPointBalance(transaction, childId);
    const existing = await transaction.dailyCheck.findUnique({
      where: { childId_date_type: { childId, date, type } },
    });
    if (existing && existing.status !== ReviewStatus.PENDING) {
      return { ok: false, error: "Взрослый уже принял решение" };
    }
    if (checked && !existing) {
      await transaction.dailyCheck.create({ data: { childId, date, type } });
    }
    if (!checked && existing) {
      await transaction.dailyCheck.deleteMany({ where: { id: existing.id, status: ReviewStatus.PENDING } });
    }
    return { ok: true };
  });
}

export async function setChoreCompletionForChild(
  childId: string,
  date: Date,
  choreId: string,
  checked: boolean,
): Promise<ChildQueueMutationResult> {
  return db.$transaction(async (transaction) => {
    await lockAndGetPointBalance(transaction, childId);
    const chore = await transaction.chore.findFirst({ where: { id: choreId, isActive: true }, select: { id: true } });
    if (!chore) return { ok: false, error: "Это дело больше не активно" };
    const existing = await transaction.choreCompletion.findUnique({
      where: { childId_date_choreId: { childId, date, choreId } },
    });
    if (existing && existing.status !== ReviewStatus.PENDING) {
      return { ok: false, error: "Взрослый уже принял решение" };
    }
    if (checked && !existing) {
      await transaction.choreCompletion.create({ data: { childId, date, choreId } });
    }
    if (!checked && existing) {
      await transaction.choreCompletion.deleteMany({ where: { id: existing.id, status: ReviewStatus.PENDING } });
    }
    return { ok: true };
  });
}

export async function saveNewProductForChild(
  childId: string,
  date: Date,
  name: string,
): Promise<ChildQueueMutationResult> {
  return db.$transaction(async (transaction) => {
    await lockAndGetPointBalance(transaction, childId);
    const existing = await transaction.newProductEntry.findUnique({ where: { childId_date: { childId, date } } });
    if (existing && existing.status !== ReviewStatus.PENDING) {
      return { ok: false, error: "Взрослый уже принял решение по продукту сегодня" };
    }
    await transaction.newProductEntry.upsert({
      where: { childId_date: { childId, date } },
      update: { name },
      create: { childId, date, name },
    });
    return { ok: true };
  });
}

export async function removeNewProductForChild(childId: string, date: Date): Promise<void> {
  await db.$transaction(async (transaction) => {
    await lockAndGetPointBalance(transaction, childId);
    await transaction.newProductEntry.deleteMany({ where: { childId, date, status: ReviewStatus.PENDING } });
  });
}
