import { describe, expect, it } from "vitest";
import { parseReviewSnapshot, sameIdSet } from "./review-snapshot";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";

describe("review snapshot", () => {
  it("parses every submitted category without truncation", () => {
    const form = new FormData();
    form.append("checkId", a);
    form.append("completionId", b);
    expect(parseReviewSnapshot(form)).toEqual({ ok: true, value: { checkIds: [a], completionIds: [b], entryIds: [] } });
  });

  it("rejects invalid, duplicate and empty snapshots", () => {
    const invalid = new FormData(); invalid.append("checkId", "bad");
    const duplicate = new FormData(); duplicate.append("checkId", a); duplicate.append("checkId", a);
    expect(parseReviewSnapshot(invalid)).toEqual({ ok: false, error: "invalid" });
    expect(parseReviewSnapshot(duplicate)).toEqual({ ok: false, error: "invalid" });
    expect(parseReviewSnapshot(new FormData())).toEqual({ ok: false, error: "empty" });
  });

  it("rejects an excessive count instead of truncating it", () => {
    const form = new FormData();
    form.append("checkId", a); form.append("checkId", b);
    form.append("checkId", "33333333-3333-4333-8333-333333333333");
    expect(parseReviewSnapshot(form)).toEqual({ ok: false, error: "too_many" });
  });

  it("accepts 100 chore ids and rejects 101", () => {
    const form = new FormData();
    for (let index = 1; index <= 100; index += 1) {
      form.append("completionId", `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    }
    expect(parseReviewSnapshot(form).ok).toBe(true);
    form.append("completionId", "00000000-0000-4000-8000-000000000101");
    expect(parseReviewSnapshot(form)).toEqual({ ok: false, error: "too_many" });
  });

  it("compares exact sets independent of order", () => {
    expect(sameIdSet([a, b], [b, a])).toBe(true);
    expect(sameIdSet([a], [a, b])).toBe(false);
  });
});
