"use server";

import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { approveReviewSnapshot, PendingSnapshotChangedError } from "@/lib/review-approval";
import { parseReviewSnapshot } from "@/lib/domain/review-snapshot";
import type { ReviewActionState } from "./adult-review-actions";
import { revalidatePath } from "next/cache";

export async function approveOverdueDay(formData: FormData): Promise<ReviewActionState> {
  const adult = await getCurrentUser();
  if (!adult || !hasPermission(adult.role, "CONFIRM_DAILY_ACTIONS")) return { error: "Действие недоступно" };
  const parsed = parseReviewSnapshot(formData);
  if (!parsed.ok) return { error: parsed.error === "empty" ? "В очереди нет действий" : parsed.error === "too_many" ? "В очереди слишком много действий — обновите страницу" : "Некорректный состав очереди" };
  try {
    await approveReviewSnapshot(parsed.value, adult.id);
  } catch (error) {
    if (error instanceof PendingSnapshotChangedError) return { error: "Очередь изменилась — проверьте снова" };
    throw error;
  }
  revalidatePath("/");
  return { ok: true };
}
