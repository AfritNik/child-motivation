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
import { revalidatePath } from "next/cache";

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

export async function fulfillRewardRequest(formData: FormData): Promise<void> {
  const adult = await getAdult();
  const requestId = formData.get("requestId");

  if (
    !adult ||
    typeof requestId !== "string" ||
    !UUID_PATTERN.test(requestId)
  ) {
    return;
  }

  await db.$transaction(async (transaction) => {
    const request = await transaction.rewardRequest.findFirst({
      where: { id: requestId, status: RewardRequestStatus.PENDING },
    });

    if (!request) {
      return;
    }

    const account = await lockAndGetPointBalance(transaction, request.userId);

    if (account.balance < request.cost) {
      return;
    }

    const update = await transaction.rewardRequest.updateMany({
      where: { id: request.id, status: RewardRequestStatus.PENDING },
      data: {
        status: RewardRequestStatus.FULFILLED,
        decidedById: adult.id,
        decidedAt: new Date(),
      },
    });

    if (update.count !== 1) {
      return;
    }

    await transaction.pointTransaction.create({
      data: {
        userId: request.userId,
        rewardRequestId: request.id,
        amount: -request.cost,
        reason: PointReason.REWARD,
      },
    });
  });

  revalidatePath("/");
}

export async function cancelRewardRequest(formData: FormData): Promise<void> {
  const adult = await getAdult();
  const requestId = formData.get("requestId");

  if (
    !adult ||
    typeof requestId !== "string" ||
    !UUID_PATTERN.test(requestId)
  ) {
    return;
  }

  await db.rewardRequest.updateMany({
    where: { id: requestId, status: RewardRequestStatus.PENDING },
    data: {
      status: RewardRequestStatus.CANCELLED,
      decidedById: adult.id,
      decidedAt: new Date(),
    },
  });

  revalidatePath("/");
}

export async function grantRewardDirectly(formData: FormData): Promise<void> {
  const adult = await getAdult();
  const rewardId = formData.get("rewardId");

  if (!adult || typeof rewardId !== "string" || !UUID_PATTERN.test(rewardId)) {
    return;
  }

  await db.$transaction(async (transaction) => {
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
      return;
    }

    const account = await lockAndGetPointBalance(transaction, child.id);

    if (account.balance < reward.cost) {
      return;
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
  });

  revalidatePath("/");
}
