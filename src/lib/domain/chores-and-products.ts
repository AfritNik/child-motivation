import { databaseDateFromKey } from "./daily-cycle";

export const MAX_CHORE_POINTS_PER_DAY = 2;
export const MAX_NEW_PRODUCT_POINTS_PER_WEEK = 3;

type ChorePointCandidate = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  pointSlotProcessed: boolean;
};

export function normalizeProductName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getMoscowWeekRange(dateKey: string): {
  startsOn: Date;
  endsBefore: Date;
} {
  const date = databaseDateFromKey(dateKey);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const startsOn = new Date(date);
  startsOn.setUTCDate(startsOn.getUTCDate() - daysSinceMonday);
  const endsBefore = new Date(startsOn);
  endsBefore.setUTCDate(endsBefore.getUTCDate() + 7);

  return { startsOn, endsBefore };
}

export function selectChoreCompletionsForPoints(
  completionsInMarkedOrder: ChorePointCandidate[],
): string[] {
  let awarded = completionsInMarkedOrder.filter(
    (completion) => completion.pointSlotProcessed,
  ).length;
  const selectedIds: string[] = [];

  for (const completion of completionsInMarkedOrder) {
    if (awarded >= MAX_CHORE_POINTS_PER_DAY) break;
    if (completion.status === "PENDING") break;

    if (completion.status === "APPROVED" && !completion.pointSlotProcessed) {
      selectedIds.push(completion.id);
      awarded += 1;
    }
  }

  return selectedIds;
}

export function canAwardNewProduct(awardedThisWeek: number): boolean {
  return awardedThisWeek < MAX_NEW_PRODUCT_POINTS_PER_WEEK;
}
