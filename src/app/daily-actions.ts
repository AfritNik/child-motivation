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
import { createCappedEarning, lockAndGetPointBalance } from "@/lib/points";
import { setDailyCheckForChild } from "@/lib/child-queue-service";
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
  const result = await setDailyCheckForChild(user.id, date, typeValue, checked);
  if (!result.ok) return result;

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

export async function approveDailyChecks(formData: FormData): Promise<DailyActionResult> {
  const adult = await getAdult();

  if (!adult) {
    return { ok: false, error: "Действие недоступно" };
  }

  const submitted = formData.getAll("checkId");
  if (submitted.length !== 1 || typeof submitted[0] !== "string" || !UUID_PATTERN.test(submitted[0])) return { ok: false, error: "Некорректные данные" };
  const checkId = submitted[0];

  const updated = await db.$transaction(async (transaction) => {
      const check = await transaction.dailyCheck.findFirst({
        where: {
          id: checkId,
          status: ReviewStatus.PENDING,
        },
      });

      if (!check) {
        return false;
      }

      await lockAndGetPointBalance(transaction, check.childId);

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
        return false;
      }

      const definition = DAILY_ITEM_DEFINITIONS[check.type];

      await createCappedEarning(transaction, {
        userId: check.childId,
        requestedAmount: definition.points,
        reason: definition.reason,
        source: { dailyCheckId: check.id },
      });
      return true;
  });
  if (!updated) return { ok: false, error: "Очередь изменилась — проверьте снова" };

  revalidatePath("/");
  return { ok: true };
}

export async function rejectDailyCheck(formData: FormData): Promise<DailyActionResult> {
  const adult = await getAdult();

  if (!adult) {
    return { ok: false, error: "Действие недоступно" };
  }

  const checkId = formData.get("checkId");
  const rejectionReason = formData.get("rejectionReason");

  if (
    typeof checkId !== "string" ||
    !UUID_PATTERN.test(checkId) ||
    typeof rejectionReason !== "string"
  ) {
    return { ok: false, error: "Некорректные данные" };
  }

  const normalizedReason = rejectionReason.trim();

  if (normalizedReason.length < 2 || normalizedReason.length > 200) {
    return { ok: false, error: "Причина должна содержать от 2 до 200 символов" };
  }

  const update = await db.dailyCheck.updateMany({
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
  if (update.count !== 1) return { ok: false, error: "Очередь изменилась — проверьте снова" };

  revalidatePath("/");
  return { ok: true };
}
