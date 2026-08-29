"use server";

import {
  AccessRole,
  PointReason,
  RewardRequestStatus,
} from "@/generated/prisma/client";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { lockAndGetPointBalance } from "@/lib/points";
import { cancelRewardRequestById, fulfillRewardRequestById } from "@/lib/reward-service";
import { revalidatePath } from "next/cache";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RewardActionResult = { ok: true } | { ok: false; error: string };

async function getChild() {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user.role, "USE_CHILD_MODE")) {
    return null;
  }

  return user;
}

async function getAdult() {
  const user = await getCurrentUser();

  if (!user || !hasPermission(user.role, "CONFIRM_REWARDS")) {
    return null;
  }

  return user;
}

export async function requestReward(formData: FormData): Promise<void> {
  const child = await getChild();
  const rewardId = formData.get("rewardId");

  if (!child || typeof rewardId !== "string" || !UUID_PATTERN.test(rewardId)) {
    return;
  }

  await db.$transaction(async (transaction) => {
    const reward = await transaction.reward.findFirst({
      where: { id: rewardId, isActive: true },
    });

    if (!reward) {
      return;
    }

    const account = await lockAndGetPointBalance(transaction, child.id);

    if (account.balance < reward.cost) {
      return;
    }

    const existingRequest = await transaction.rewardRequest.findFirst({
      where: {
        userId: child.id,
        rewardId: reward.id,
        status: RewardRequestStatus.PENDING,
      },
      select: { id: true },
    });

    if (existingRequest) {
      return;
    }

    await transaction.rewardRequest.create({
      data: {
        userId: child.id,
        rewardId: reward.id,
        cost: reward.cost,
      },
    });
  });

  revalidatePath("/");
}

export async function fulfillRewardRequest(formData: FormData): Promise<RewardActionResult> {
  const adult = await getAdult();
  const requestId = formData.get("requestId");

  if (
    !adult ||
    typeof requestId !== "string" ||
    !UUID_PATTERN.test(requestId)
  ) {
    return { ok: false, error: "Некорректные данные или действие недоступно" };
  }

  const result = await fulfillRewardRequestById(requestId, adult.id);
  if (result === "balance") return { ok: false, error: "На балансе уже недостаточно баллов" };
  if (result === "stale") return { ok: false, error: "Запрос уже изменился — обновите страницу" };

  revalidatePath("/");
  return { ok: true };
}

export async function cancelRewardRequest(formData: FormData): Promise<RewardActionResult> {
  const adult = await getAdult();
  const requestId = formData.get("requestId");

  if (
    !adult ||
    typeof requestId !== "string" ||
    !UUID_PATTERN.test(requestId)
  ) {
    return { ok: false, error: "Некорректные данные или действие недоступно" };
  }

  const result = await cancelRewardRequestById(requestId, adult.id);
  if (result === "stale") return { ok: false, error: "Запрос уже изменился — обновите страницу" };

  revalidatePath("/");
  return { ok: true };
}

export async function cancelOwnRewardRequest(formData: FormData): Promise<void> {
  const child = await getChild();
  const requestId = formData.get("requestId");

  if (
    !child ||
    typeof requestId !== "string" ||
    !UUID_PATTERN.test(requestId)
  ) {
    return;
  }

  await db.rewardRequest.updateMany({
    where: {
      id: requestId,
      userId: child.id,
      status: RewardRequestStatus.PENDING,
    },
    data: {
      status: RewardRequestStatus.CANCELLED,
      decidedAt: new Date(),
      decidedById: null,
    },
  });

  revalidatePath("/");
}

export async function grantRewardDirectly(formData: FormData): Promise<RewardActionResult> {
  const adult = await getAdult();
  const rewardId = formData.get("rewardId");

  if (!adult || typeof rewardId !== "string" || !UUID_PATTERN.test(rewardId)) {
    return { ok: false, error: "Некорректные данные или действие недоступно" };
  }

  const result = await db.$transaction(async (transaction) => {
    const [reward, child] = await Promise.all([
      transaction.reward.findFirst({
        where: { id: rewardId, isActive: true },
      }),
      transaction.user.findFirst({
        where: { role: AccessRole.CHILD, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      }),
    ]);

    if (!reward || !child) {
      return "missing" as const;
    }

    const account = await lockAndGetPointBalance(transaction, child.id);

    if (account.balance < reward.cost) {
      return "balance" as const;
    }

    const request = await transaction.rewardRequest.create({
      data: {
        userId: child.id,
        rewardId: reward.id,
        cost: reward.cost,
        status: RewardRequestStatus.FULFILLED,
        decidedById: adult.id,
        decidedAt: new Date(),
      },
    });

    await transaction.pointTransaction.create({
      data: {
        userId: child.id,
        rewardRequestId: request.id,
        amount: -reward.cost,
        reason: PointReason.REWARD,
      },
    });
    return "ok" as const;
  });
  if (result === "missing") return { ok: false, error: "Награда больше недоступна" };
  if (result === "balance") return { ok: false, error: "На балансе уже недостаточно баллов" };

  revalidatePath("/");
  return { ok: true };
}
