"use server";

import { ReviewStatus } from "@/generated/prisma/client";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  normalizeProductName,
} from "@/lib/domain/chores-and-products";
import {
  databaseDateFromKey,
  getMoscowDateKey,
} from "@/lib/domain/daily-cycle";
import { removeNewProductForChild, saveNewProductForChild, setChoreCompletionForChild } from "@/lib/child-queue-service";
import { approveChoreCompletionById, approveNewProductById, rejectChoreCompletionById } from "@/lib/review-item-service";
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

  const date = databaseDateFromKey(getMoscowDateKey());
  const result = await setChoreCompletionForChild(child.id, date, choreId, checked);
  if (!result.ok) return result;

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
  const result = await saveNewProductForChild(child.id, date, name);
  if (!result.ok) return { error: result.error };

  revalidatePath("/");
  return { saved: true };
}

export async function removeNewProduct(): Promise<void> {
  const child = await getChild();

  if (!child) {
    return;
  }

  await removeNewProductForChild(child.id, databaseDateFromKey(getMoscowDateKey()));

  revalidatePath("/");
}

export async function approveChoreCompletions(
  formData: FormData,
): Promise<ActionResult> {
  const adult = await getAdult();

  if (!adult) {
    return { ok: false, error: "Действие недоступно" };
  }

  const submitted = formData.getAll("completionId");
  if (submitted.length !== 1 || typeof submitted[0] !== "string" || !UUID_PATTERN.test(submitted[0])) return { ok: false, error: "Некорректные данные" };
  const completionId = submitted[0];

  const updated = await approveChoreCompletionById(completionId, adult.id);
  if (!updated) return { ok: false, error: "Очередь изменилась — проверьте снова" };

  revalidatePath("/");
  return { ok: true };
}

export async function rejectChoreCompletion(
  formData: FormData,
): Promise<ActionResult> {
  const adult = await getAdult();

  if (!adult) {
    return { ok: false, error: "Действие недоступно" };
  }

  const completionId = formData.get("completionId");
  const rawReason = formData.get("rejectionReason");

  if (
    typeof completionId !== "string" ||
    !UUID_PATTERN.test(completionId) ||
    typeof rawReason !== "string"
  ) {
    return { ok: false, error: "Некорректные данные" };
  }

  const rejectionReason = rawReason.trim();

  if (rejectionReason.length < 2 || rejectionReason.length > 200) {
    return { ok: false, error: "Причина должна содержать от 2 до 200 символов" };
  }

  const updated = await rejectChoreCompletionById(completionId, adult.id, rejectionReason);
  if (!updated) return { ok: false, error: "Очередь изменилась — проверьте снова" };

  revalidatePath("/");
  return { ok: true };
}

export async function approveNewProduct(formData: FormData): Promise<ActionResult> {
  const adult = await getAdult();
  const entryId = formData.get("entryId");

  if (!adult || typeof entryId !== "string" || !UUID_PATTERN.test(entryId)) {
    return { ok: false, error: "Некорректные данные или действие недоступно" };
  }

  const updated = await approveNewProductById(entryId, adult.id);
  if (!updated) return { ok: false, error: "Очередь изменилась — проверьте снова" };

  revalidatePath("/");
  return { ok: true };
}

export async function rejectNewProduct(formData: FormData): Promise<ActionResult> {
  const adult = await getAdult();
  const entryId = formData.get("entryId");
  const rawReason = formData.get("rejectionReason");

  if (
    !adult ||
    typeof entryId !== "string" ||
    !UUID_PATTERN.test(entryId) ||
    typeof rawReason !== "string"
  ) {
    return { ok: false, error: "Некорректные данные или действие недоступно" };
  }

  const rejectionReason = rawReason.trim();

  if (rejectionReason.length < 2 || rejectionReason.length > 200) {
    return { ok: false, error: "Причина должна содержать от 2 до 200 символов" };
  }

  const update = await db.newProductEntry.updateMany({
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
  if (update.count !== 1) return { ok: false, error: "Очередь изменилась — проверьте снова" };

  revalidatePath("/");
  return { ok: true };
}
