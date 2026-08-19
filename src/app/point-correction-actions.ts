"use server";

import { AccessRole, PointReason } from "@/generated/prisma/client";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { calculateCorrectedBalance } from "@/lib/domain/points";
import { lockAndGetPointBalance } from "@/lib/points";
import { revalidatePath } from "next/cache";

export type PointCorrectionState = {
  error?: string;
  message?: string;
};

export async function createPointCorrection(
  _previousState: PointCorrectionState,
  formData: FormData,
): Promise<PointCorrectionState> {
  const admin = await getCurrentUser();

  if (!admin || !hasPermission(admin.role, "CORRECT_POINTS")) {
    return { error: "Исправлять баланс может только администратор" };
  }

  const rawAmount = formData.get("amount");
  const rawNote = formData.get("note");
  const amount = typeof rawAmount === "string" ? Number(rawAmount) : NaN;
  const note = typeof rawNote === "string" ? rawNote.trim() : "";

  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100) {
    return { error: "Укажите целое число баллов от −100 до 100, кроме нуля" };
  }

  if (note.length < 2 || note.length > 200) {
    return { error: "Причина должна содержать от 2 до 200 символов" };
  }

  const child = await db.user.findFirst({
    where: { role: AccessRole.CHILD, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  if (!child) return { error: "Детский аккаунт не найден" };

  const result = await db.$transaction(async (transaction) => {
    const account = await lockAndGetPointBalance(transaction, child.id);
    const nextBalance = calculateCorrectedBalance(
      account.balance,
      account.limit,
      amount,
    );

    if (nextBalance === null) {
      return {
        error: `После исправления баланс должен быть от 0 до ${account.limit}`,
      };
    }

    const correction = await transaction.pointCorrection.create({
      data: {
        userId: child.id,
        createdById: admin.id,
        amount,
        note,
      },
    });

    await transaction.pointTransaction.create({
      data: {
        userId: child.id,
        pointCorrectionId: correction.id,
        amount,
        reason: PointReason.CORRECTION,
      },
    });

    return { nextBalance };
  });

  if ("error" in result) return { error: result.error };

  revalidatePath("/");
  return { message: `Исправление записано. Новый баланс: ${result.nextBalance}` };
}
