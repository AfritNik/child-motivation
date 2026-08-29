import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AccessRole,
  DailyCheckType,
  PointReason,
  ReviewStatus,
  RewardRequestStatus,
  ScreenMode,
  SubjectPriority,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { setDailyCheckForChild } from "@/lib/child-queue-service";
import { approveReviewSnapshot, PendingSnapshotChangedError } from "@/lib/review-approval";
import { approveChoreCompletionById, approveNewProductById, rejectChoreCompletionById } from "@/lib/review-item-service";
import { cancelRewardRequestById, fulfillRewardRequestById } from "@/lib/reward-service";
import { calculateStudyModeForQuarter, saveStudyAveragesForQuarter } from "@/lib/study-service";

const date = (key: string) => new Date(`${key}T00:00:00.000Z`);

beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.INTEGRATION_TEST_DATABASE !== "true" ||
    url.hostname !== "127.0.0.1" ||
    url.port === "5432" ||
    url.pathname !== "/family_motivation_integration"
  ) throw new Error("Integration tests refused a non-isolated database");
});

beforeEach(async () => {
  await db.pointTransaction.deleteMany();
  await db.pointCorrection.deleteMany();
  await db.rewardRequest.deleteMany();
  await db.dailyCheck.deleteMany();
  await db.choreCompletion.deleteMany();
  await db.newProductEntry.deleteMany();
  await db.weekDecision.deleteMany();
  await db.subject.deleteMany();
  await db.academicQuarter.deleteMany();
  await db.screenModeSetting.deleteMany();
  await db.chore.deleteMany();
  await db.reward.deleteMany();
  await db.user.deleteMany();
});

async function family() {
  const [child, adult] = await Promise.all([
    db.user.create({ data: { displayName: "Саша test", role: AccessRole.CHILD, pinHash: "test", pointBalanceLimit: 100 } }),
    db.user.create({ data: { displayName: "Папа test", role: AccessRole.ADMIN, pinHash: "test" } }),
  ]);
  return { child, adult };
}

async function correction(userId: string, adultId: string, amount: number) {
  const item = await db.pointCorrection.create({ data: { userId, createdById: adultId, amount, note: "Тестовый баланс" } });
  return db.pointTransaction.create({ data: { userId, pointCorrectionId: item.id, amount, reason: PointReason.CORRECTION } });
}

describe("review transaction atomicity", () => {
  it("rolls back when the exact pending snapshot omits an item", async () => {
    const { child, adult } = await family();
    const items = await Promise.all([
      db.dailyCheck.create({ data: { childId: child.id, date: date("2026-09-08"), type: DailyCheckType.SELF_DIRECTED_STUDY } }),
      db.dailyCheck.create({ data: { childId: child.id, date: date("2026-09-08"), type: DailyCheckType.PERSONAL_ROUTINE } }),
    ]);
    await expect(approveReviewSnapshot({ checkIds: [items[0].id], completionIds: [], entryIds: [] }, adult.id))
      .rejects.toBeInstanceOf(PendingSnapshotChangedError);
    expect(await db.dailyCheck.count({ where: { childId: child.id, status: ReviewStatus.PENDING } })).toBe(2);
    expect(await db.pointTransaction.count()).toBe(0);
  });

  it("caps a bulk earning at 100 and remains idempotent", async () => {
    const { child, adult } = await family();
    await correction(child.id, adult.id, 99);
    const check = await db.dailyCheck.create({ data: { childId: child.id, date: date("2026-09-08"), type: DailyCheckType.SELF_DIRECTED_STUDY } });
    const snapshot = { checkIds: [check.id], completionIds: [], entryIds: [] };
    const results = await Promise.allSettled([
      approveReviewSnapshot(snapshot, adult.id),
      approveReviewSnapshot(snapshot, adult.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.pointTransaction.aggregate({ where: { userId: child.id }, _sum: { amount: true } })).toMatchObject({ _sum: { amount: 100 } });
    expect(await db.pointTransaction.count({ where: { dailyCheckId: check.id } })).toBe(1);
    await expect(approveReviewSnapshot(snapshot, adult.id)).rejects.toBeInstanceOf(PendingSnapshotChangedError);
  });

  it("serializes bulk approval against child create and delete without partial decisions", async () => {
    const { child, adult } = await family();
    const day = date("2026-09-09");
    const study = await db.dailyCheck.create({ data: { childId: child.id, date: day, type: DailyCheckType.SELF_DIRECTED_STUDY } });
    await Promise.allSettled([
      approveReviewSnapshot({ checkIds: [study.id], completionIds: [], entryIds: [] }, adult.id),
      setDailyCheckForChild(child.id, day, DailyCheckType.PERSONAL_ROUTINE, true),
    ]);
    const afterCreate = await db.dailyCheck.findMany({ where: { childId: child.id, date: day }, orderBy: { type: "asc" } });
    expect(afterCreate).toHaveLength(2);
    const approvedAfterCreate = afterCreate.filter((item) => item.status === ReviewStatus.APPROVED);
    expect(approvedAfterCreate.length === 0 || approvedAfterCreate.length === 1).toBe(true);
    expect(await db.pointTransaction.count()).toBe(approvedAfterCreate.length === 1 ? 1 : 0);

    await db.pointTransaction.deleteMany();
    await db.dailyCheck.updateMany({ where: { childId: child.id, date: day }, data: { status: ReviewStatus.PENDING, decidedAt: null, decidedById: null } });
    const snapshot = {
      checkIds: afterCreate.map((item) => item.id), completionIds: [], entryIds: [],
    };
    await Promise.allSettled([
      approveReviewSnapshot(snapshot, adult.id),
      setDailyCheckForChild(child.id, day, DailyCheckType.SELF_DIRECTED_STUDY, false),
    ]);
    const afterDelete = await db.dailyCheck.findMany({ where: { childId: child.id, date: day } });
    const approved = afterDelete.filter((item) => item.status === ReviewStatus.APPROVED);
    expect(approved.length === 0 || approved.length === 2).toBe(true);
  });

  it("allows exactly one result in an approve/reject chore race", async () => {
    const { child, adult } = await family();
    const chore = await db.chore.create({ data: { name: "Тестовое дело" } });
    const completion = await db.choreCompletion.create({ data: { childId: child.id, choreId: chore.id, date: date("2026-09-10") } });
    const results = await Promise.all([
      approveChoreCompletionById(completion.id, adult.id),
      rejectChoreCompletionById(completion.id, adult.id, "Не выполнено"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const decided = await db.choreCompletion.findUniqueOrThrow({ where: { id: completion.id }, include: { pointTransaction: true } });
    expect(decided.status).not.toBe(ReviewStatus.PENDING);
    expect(decided.pointTransaction !== null).toBe(decided.status === ReviewStatus.APPROVED);
  });
});

describe("weekly products and study serialization", () => {
  it("never awards more than three products per week and resets at the week boundary", async () => {
    const { child, adult } = await family();
    const entries = await Promise.all(["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"].map((key) =>
      db.newProductEntry.create({ data: { childId: child.id, date: date(key), name: `Продукт ${key}` } }),
    ));
    expect(await Promise.all(entries.map((entry) => approveNewProductById(entry.id, adult.id)))).toEqual([true, true, true, true]);
    expect(await db.pointTransaction.count({ where: { userId: child.id, reason: PointReason.NEW_PRODUCT } })).toBe(3);
    const nextWeek = await db.newProductEntry.create({ data: { childId: child.id, date: date("2026-09-14"), name: "Следующая неделя" } });
    expect(await approveNewProductById(nextWeek.id, adult.id)).toBe(true);
    expect(await db.pointTransaction.count({ where: { userId: child.id, reason: PointReason.NEW_PRODUCT } })).toBe(4);
  });

  it("cannot publish a fresh calculation from averages made stale concurrently", async () => {
    await family();
    const quarter = await db.academicQuarter.create({ data: { schoolYear: "test", number: 1, startsOn: date("2026-09-01"), endsOn: date("2026-10-31") } });
    await db.screenModeSetting.createMany({ data: [
      { mode: ScreenMode.FULL, dailyLimitMinutes: 120 },
      { mode: ScreenMode.STANDARD, dailyLimitMinutes: 60 },
      { mode: ScreenMode.RECOVERY, dailyLimitMinutes: 30 },
    ] });
    const subjects = await Promise.all([
      db.subject.create({ data: { name: "Математика test", priority: SubjectPriority.HIGH, currentAverage: 4, quarterId: quarter.id, sortOrder: 1 } }),
      db.subject.create({ data: { name: "Русский test", priority: SubjectPriority.HIGH, currentAverage: 4, quarterId: quarter.id, sortOrder: 2 } }),
    ]);
    const startsOn = date("2026-09-14");
    const endsOn = date("2026-09-20");
    const rawAverages = { [subjects[0].id]: "3.20", [subjects[1].id]: "4.00" };
    await Promise.all([
      saveStudyAveragesForQuarter({ quarterId: quarter.id, nextWeekStartsOn: startsOn, rawAverages }),
      calculateStudyModeForQuarter({ quarterId: quarter.id, startsOn, endsOn }),
    ]);
    let decision = await db.weekDecision.findUniqueOrThrow({ where: { startsOn } });
    if (!decision.isStale) expect(decision.mode).toBe(ScreenMode.RECOVERY);
    await calculateStudyModeForQuarter({ quarterId: quarter.id, startsOn, endsOn });
    decision = await db.weekDecision.findUniqueOrThrow({ where: { startsOn } });
    expect(decision).toMatchObject({ mode: ScreenMode.RECOVERY, isStale: false });
  });
});

describe("reward decisions and ledger", () => {
  it("makes fulfill/cancel and double fulfill races atomic", async () => {
    const { child, adult } = await family();
    await correction(child.id, adult.id, 30);
    const reward = await db.reward.create({ data: { name: "Тестовая награда", description: "Тест", cost: 10 } });
    const raced = await db.rewardRequest.create({ data: { userId: child.id, rewardId: reward.id, cost: reward.cost } });
    const raceResults = await Promise.all([
      fulfillRewardRequestById(raced.id, adult.id),
      cancelRewardRequestById(raced.id, adult.id),
    ]);
    expect(raceResults.filter((result) => result === "ok")).toHaveLength(1);
    const racedResult = await db.rewardRequest.findUniqueOrThrow({ where: { id: raced.id } });
    expect(await db.pointTransaction.count({ where: { rewardRequestId: raced.id } })).toBe(racedResult.status === RewardRequestStatus.FULFILLED ? 1 : 0);

    const doubled = await db.rewardRequest.create({ data: { userId: child.id, rewardId: reward.id, cost: reward.cost } });
    const doubledResults = await Promise.all([
      fulfillRewardRequestById(doubled.id, adult.id),
      fulfillRewardRequestById(doubled.id, adult.id),
    ]);
    expect(doubledResults.sort()).toEqual(["ok", "stale"]);
    expect(await db.pointTransaction.count({ where: { rewardRequestId: doubled.id } })).toBe(1);
  });

  it("keeps the balance equal to the immutable ledger with one source per transaction", async () => {
    const { child, adult } = await family();
    await correction(child.id, adult.id, 99);
    const check = await db.dailyCheck.create({ data: { childId: child.id, date: date("2026-09-12"), type: DailyCheckType.PERSONAL_ROUTINE } });
    await approveReviewSnapshot({ checkIds: [check.id], completionIds: [], entryIds: [] }, adult.id);
    const transactions = await db.pointTransaction.findMany({ where: { userId: child.id } });
    expect(transactions.reduce((sum, item) => sum + item.amount, 0)).toBe(100);
    for (const transaction of transactions) {
      const sources = [transaction.dailyCheckId, transaction.choreCompletionId, transaction.newProductEntryId, transaction.rewardRequestId, transaction.pointCorrectionId].filter(Boolean);
      expect(sources).toHaveLength(1);
    }
  });
});
