"use server";

import {
  PointReason,
  Prisma,
  ReviewStatus,
} from "@/generated/prisma/client";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  canAwardNewProduct,
  getMoscowWeekRange,
  normalizeProductName,
  selectChoreCompletionsForPoints,
} from "@/lib/domain/chores-and-products";
import {
  databaseDateFromKey,
  getMoscowDateKey,
} from "@/lib/domain/daily-cycle";
import { createCappedEarning } from "@/lib/points";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true } | { ok: false; error: string };

export type ProductFormState = {
  error?: string;
  saved?: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getChild() {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user.role, "USE_CHILD_MODE")) {
    return null;
  }

  return user;
}

async function getAdult() {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user.role, "CONFIRM_DAILY_ACTIONS")) {
    return null;
  }

  return user;
}

export async function setChoreCompletion(
  choreId: string,
  checked: boolean,
): Promise<ActionResult> {
  const child = await getChild();

  if (!child) {
    return { ok: false, error: "Это действие доступно только Саше" };
  }

  if (!UUID_PATTERN.test(choreId)) {
    return { ok: false, error: "Неизвестное домашнее дело" };
  }

  const chore = await db.chore.findFirst({
    where: { id: choreId, isActive: true },
    select: { id: true },
  });

  if (!chore) {
    return { ok: false, error: "Это дело больше не активно" };
  }

  const date = databaseDateFromKey(getMoscowDateKey());
  const existingCompletion = await db.choreCompletion.findUnique({
    where: {
      childId_date_choreId: {
        childId: child.id,
        date,
        choreId,
      },
    },
  });

  if (
    existingCompletion &&
    existingCompletion.status !== ReviewStatus.PENDING
  ) {
    return { ok: false, error: "Взрослый уже принял решение" };
  }

  if (checked && !existingCompletion) {
    await db.choreCompletion.create({
      data: { childId: child.id, choreId, date },
    });
  }

  if (!checked && existingCompletion) {
    await db.choreCompletion.deleteMany({
      where: { id: existingCompletion.id, status: ReviewStatus.PENDING },
    });
  }

  revalidatePath("/");
  return { ok: true };
}

export async function saveNewProduct(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const child = await getChild();

  if (!child) {
    return { error: "Это действие доступно только Саше" };
  }

  const rawName = formData.get("name");

  if (typeof rawName !== "string") {
    return { error: "Введите название продукта" };
  }

  const name = normalizeProductName(rawName);

  if (name.length < 2 || name.length > 100) {
    return { error: "Название должно содержать от 2 до 100 символов" };
  }

  const date = databaseDateFromKey(getMoscowDateKey());
  const existingEntry = await db.newProductEntry.findUnique({
    where: { childId_date: { childId: child.id, date } },
  });

  if (existingEntry && existingEntry.status !== ReviewStatus.PENDING) {
    return { error: "Взрослый уже принял решение по продукту сегодня" };
  }

  await db.newProductEntry.upsert({
    where: { childId_date: { childId: child.id, date } },
    update: { name },
    create: { childId: child.id, date, name },
  });

  revalidatePath("/");
  return { saved: true };
}

export async function removeNewProduct(): Promise<void> {
  const child = await getChild();

  if (!child) {
    return;
  }

  await db.newProductEntry.deleteMany({
    where: {
      childId: child.id,
      date: databaseDateFromKey(getMoscowDateKey()),
      status: ReviewStatus.PENDING,
    },
  });

  revalidatePath("/");
}

async function allocateChorePoints(
  transaction: Prisma.TransactionClient,
  childId: string,
  date: Date,
): Promise<void> {
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
        completion.pointTransaction !== null ||
        completion.pointsProcessedAt !== null,
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

export async function approveChoreCompletions(
  formData: FormData,
): Promise<void> {
  const adult = await getAdult();

  if (!adult) {
    return;
  }

  const completionIds = [
    ...new Set(
      formData
        .getAll("completionId")
        .filter((value): value is string => typeof value === "string")
        .filter((value) => UUID_PATTERN.test(value)),
    ),
  ].slice(0, 20);

  if (completionIds.length === 0) {
    return;
  }

  await db.$transaction(async (transaction) => {
    const completions = await transaction.choreCompletion.findMany({
      where: {
        id: { in: completionIds },
        status: ReviewStatus.PENDING,
      },
      select: { id: true, childId: true, date: true },
    });

    if (completions.length === 0) {
      return;
    }

    await transaction.choreCompletion.updateMany({
      where: {
        id: { in: completions.map((completion) => completion.id) },
        status: ReviewStatus.PENDING,
      },
      data: {
        status: ReviewStatus.APPROVED,
        decidedById: adult.id,
        decidedAt: new Date(),
        rejectionReason: null,
      },
    });

    const affectedDays = new Map(
      completions.map((completion) => [
        `${completion.childId}:${completion.date.toISOString()}`,
        { childId: completion.childId, date: completion.date },
      ]),
    );

    for (const { childId, date } of affectedDays.values()) {
      await allocateChorePoints(transaction, childId, date);
    }
  });

  revalidatePath("/");
}

export async function rejectChoreCompletion(
  formData: FormData,
): Promise<void> {
  const adult = await getAdult();

  if (!adult) {
    return;
  }

  const completionId = formData.get("completionId");
  const rawReason = formData.get("rejectionReason");

  if (
    typeof completionId !== "string" ||
    !UUID_PATTERN.test(completionId) ||
    typeof rawReason !== "string"
  ) {
    return;
  }

  const rejectionReason = rawReason.trim();

  if (rejectionReason.length < 2 || rejectionReason.length > 200) {
    return;
  }

  await db.$transaction(async (transaction) => {
    const completion = await transaction.choreCompletion.findFirst({
      where: {
        id: completionId,
        status: ReviewStatus.PENDING,
      },
      select: { id: true, childId: true, date: true },
    });

    if (!completion) {
      return;
    }

    await transaction.choreCompletion.update({
      where: { id: completion.id },
      data: {
        status: ReviewStatus.REJECTED,
        decidedById: adult.id,
        decidedAt: new Date(),
        rejectionReason,
      },
    });

    await allocateChorePoints(
      transaction,
      completion.childId,
      completion.date,
    );
  });

  revalidatePath("/");
}

export async function approveNewProduct(formData: FormData): Promise<void> {
  const adult = await getAdult();
  const entryId = formData.get("entryId");

  if (!adult || typeof entryId !== "string" || !UUID_PATTERN.test(entryId)) {
    return;
  }

  await db.$transaction(async (transaction) => {
    const entry = await transaction.newProductEntry.findFirst({
      where: { id: entryId, status: ReviewStatus.PENDING },
    });

    if (!entry) {
      return;
    }

    const entryDateKey = entry.date.toISOString().slice(0, 10);
    const week = getMoscowWeekRange(entryDateKey);

    const update = await transaction.newProductEntry.updateMany({
      where: { id: entry.id, status: ReviewStatus.PENDING },
      data: {
        status: ReviewStatus.APPROVED,
        decidedById: adult.id,
        decidedAt: new Date(),
        rejectionReason: null,
      },
    });

    if (update.count !== 1) {
      return;
    }

    const weekEntries = await transaction.newProductEntry.findMany({
      where: {
        childId: entry.childId,
        date: { gte: week.startsOn, lt: week.endsBefore },
      },
      include: { pointTransaction: true },
    });
    const awardedThisWeek = weekEntries.filter(
      (weekEntry) => weekEntry.pointTransaction !== null,
    ).length;

    if (canAwardNewProduct(awardedThisWeek)) {
      await createCappedEarning(transaction, {
        userId: entry.childId,
        requestedAmount: 1,
        reason: PointReason.NEW_PRODUCT,
        source: { newProductEntryId: entry.id },
      });
    }
  });

  revalidatePath("/");
}

export async function rejectNewProduct(formData: FormData): Promise<void> {
  const adult = await getAdult();
  const entryId = formData.get("entryId");
  const rawReason = formData.get("rejectionReason");

  if (
    !adult ||
    typeof entryId !== "string" ||
    !UUID_PATTERN.test(entryId) ||
    typeof rawReason !== "string"
  ) {
    return;
  }

  const rejectionReason = rawReason.trim();

  if (rejectionReason.length < 2 || rejectionReason.length > 200) {
    return;
  }

  await db.newProductEntry.updateMany({
    where: {
      id: entryId,
      status: ReviewStatus.PENDING,
    },
    data: {
      status: ReviewStatus.REJECTED,
      decidedById: adult.id,
      decidedAt: new Date(),
      rejectionReason,
    },
  });

  revalidatePath("/");
}
