export type SnapshotIds = {
  checkIds: string[];
  completionIds: string[];
  entryIds: string[];
};

export type SnapshotParseResult =
  | { ok: true; value: SnapshotIds }
  | { ok: false; error: "invalid" | "empty" | "too_many" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCategory(formData: FormData, name: string, maximum: number): string[] | "invalid" | "too_many" {
  const values = formData.getAll(name);
  if (values.length > maximum) return "too_many";
  if (values.some((value) => typeof value !== "string" || !UUID_PATTERN.test(value))) return "invalid";
  const strings = values as string[];
  if (new Set(strings).size !== strings.length) return "invalid";
  return strings;
}

export function parseReviewSnapshot(formData: FormData): SnapshotParseResult {
  const checkIds = parseCategory(formData, "checkId", 2);
  const completionIds = parseCategory(formData, "completionId", 100);
  const entryIds = parseCategory(formData, "entryId", 1);
  const results = [checkIds, completionIds, entryIds];
  if (results.includes("too_many")) return { ok: false, error: "too_many" };
  if (results.includes("invalid")) return { ok: false, error: "invalid" };
  if (typeof checkIds === "string" || typeof completionIds === "string" || typeof entryIds === "string") return { ok: false, error: "invalid" };
  if (checkIds.length + completionIds.length + entryIds.length === 0) return { ok: false, error: "empty" };
  return { ok: true, value: { checkIds, completionIds, entryIds } };
}

export function sameIdSet(actual: string[], submitted: string[]): boolean {
  return actual.length === submitted.length && actual.every((id) => submitted.includes(id));
}
