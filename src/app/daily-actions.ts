"use server";

import { ReviewStatus } from "@/generated/prisma/client";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  DAILY_ITEM_DEFINITIONS,
  databaseDateFromKey,
  getMoscowDateKey,
  isDailyCheckType,
} from "@/lib/domain/daily-cycle";
import { createCappedEarning } from "@/lib/points";
import { revalidatePath } from "next/cache";

type DailyActionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function setDailyCheck(
  typeValue: string,
  checked: boolean,
): Promise<DailyActionResult> {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user.role, "USE_CHILD_MODE")) {
    return { ok: false, error: "Это действие доступно только Саше" };
  }

  if (!isDailyCheckType(typeValue)) {
    return { ok: false, error: "Неизвестный ежедневный пункт" };
  }

  const date = databaseDateFromKey(getMoscowDateKey());
  const existingCheck = await db.dailyCheck.findUnique({
    where: {
      childId_date_type: {
        childId: user.id,
        date,
        type: typeValue,
      },
    },
  });

  if (existingCheck && existingCheck.status !== ReviewStatus.PENDING) {
    return { ok: false, error: "Взрослый уже принял решение" };
  }

  if (checked && !existingCheck) {
    await db.dailyCheck.create({
      data: {
        childId: user.id,
        date,
        type: typeValue,
      },
    });
  }

  if (!checked && existingCheck) {
    await db.dailyCheck.deleteMany({
      where: {
        id: existingCheck.id,
        status: ReviewStatus.PENDING,
      },
    });
  }

  revalidatePath("/");
  return { ok: true };
}

async function getAdult() {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user.role, "CONFIRM_DAILY_ACTIONS")) {
    return null;
  }

  return user;
}

export async function approveDailyChecks(formData: FormData): Promise<void> {
  const adult = await getAdult();

  if (!adult) {
    return;
  }

  const checkIds = [
    ...new Set(
      formData
        .getAll("checkId")
        .filter((value): value is string => typeof value === "string")
        .filter((value) => UUID_PATTERN.test(value)),
    ),
  ].slice(0, 2);

  if (checkIds.length === 0) {
    return;
  }

  await db.$transaction(async (transaction) => {
    for (const checkId of checkIds) {
      const check = await transaction.dailyCheck.findFirst({
        where: {
          id: checkId,
          status: ReviewStatus.PENDING,
        },
      });

      if (!check) {
        continue;
      }

      const update = await transaction.dailyCheck.updateMany({
        where: {
          id: check.id,
          status: ReviewStatus.PENDING,
        },
        data: {
          status: ReviewStatus.APPROVED,
          decidedById: adult.id,
          decidedAt: new Date(),
          rejectionReason: null,
        },
      });

      if (update.count !== 1) {
        continue;
      }

      const definition = DAILY_ITEM_DEFINITIONS[check.type];

      await createCappedEarning(transaction, {
        userId: check.childId,
        requestedAmount: definition.points,
        reason: definition.reason,
        source: { dailyCheckId: check.id },
      });
    }
  });

  revalidatePath("/");
}

export async function rejectDailyCheck(formData: FormData): Promise<void> {
  const adult = await getAdult();

  if (!adult) {
    return;
  }

  const checkId = formData.get("checkId");
  const rejectionReason = formData.get("rejectionReason");

  if (
    typeof checkId !== "string" ||
    !UUID_PATTERN.test(checkId) ||
    typeof rejectionReason !== "string"
  ) {
    return;
  }

  const normalizedReason = rejectionReason.trim();

  if (normalizedReason.length < 2 || normalizedReason.length > 200) {
    return;
  }

  await db.dailyCheck.updateMany({
    where: {
      id: checkId,
      status: ReviewStatus.PENDING,
    },
    data: {
      status: ReviewStatus.REJECTED,
      decidedById: adult.id,
      decidedAt: new Date(),
      rejectionReason: normalizedReason,
    },
  });

  revalidatePath("/");
}
