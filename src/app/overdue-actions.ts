"use server";

import { approveChoreCompletions, approveNewProduct } from "./chores-products-actions";
import { approveDailyChecks } from "./daily-actions";

export async function approveOverdueDay(formData: FormData): Promise<void> {
  const dailyForm = new FormData();
  const choreForm = new FormData();
  const productIds = formData
    .getAll("entryId")
    .filter((value): value is string => typeof value === "string");

  for (const checkId of formData.getAll("checkId")) {
    dailyForm.append("checkId", checkId);
  }
  for (const completionId of formData.getAll("completionId")) {
    choreForm.append("completionId", completionId);
  }

  await approveDailyChecks(dailyForm);
  await approveChoreCompletions(choreForm);

  for (const entryId of productIds) {
    const productForm = new FormData();
    productForm.set("entryId", entryId);
    await approveNewProduct(productForm);
  }
}
