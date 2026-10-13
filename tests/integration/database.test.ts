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
import { importStudySheet } from "@/lib/study-import-service";
import { changeStudyMark, applyStudyTime } from "@/lib/study-journal-service";
import { randomUUID } from "node:crypto";

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
  await db.screenTimeState.deleteMany();
  await db.pointTransaction.deleteMany();
  await db.pointCorrection.deleteMany();
  await db.rewardRequest.deleteMany();
  await db.dailyCheck.deleteMany();
  await db.choreCompletion.deleteMany();
  await db.newProductEntry.deleteMany();
  await db.weekDecision.deleteMany();
  await db.studyMark.deleteMany();
  await db.subject.deleteMany();
  await db.academicQuarter.deleteMany();
  await db.screenModeSetting.deleteMany();
  await db.chore.deleteMany();
  await db.reward.deleteMany();
  await db.user.deleteMany();
});

describe("manual study journal", () => {
  async function fixture() {
    const quarter = await db.academicQuarter.create({ data: { schoolYear: "2026/27", number: 1, startsOn: date("2026-09-01"), endsOn: date("2026-10-25") } });
    const subject = await db.subject.create({ data: { name: "Математика", priority: SubjectPriority.HIGH } });
    await db.screenTimeState.create({ data: { id: 1, dailyLimitMinutes: 60, explanation: "Before" } });
    return { quarterId: quarter.id, subjectId: subject.id };
  }
  const today = date("2026-09-28");
  it("adds without date, edits, deletes and restores independently of applied time", async () => {
    const ids = await fixture();
    const input = { ...ids, markId: randomUUID(), operation: "add" as const, value: 5 };
    await changeStudyMark(input, today);
    await changeStudyMark(input, today);
    expect(await db.studyMark.count()).toBe(1);
    expect((await db.studyMark.findFirst())?.date).toBeNull();
    expect((await db.screenTimeState.findFirst())?.dailyLimitMinutes).toBe(60);
    await applyStudyTime(ids.quarterId, 70, today);
    await changeStudyMark({ ...input, operation: "edit", expectedValue: 5, value: 3 }, today);
    expect((await db.subject.findFirst())?.currentAverage?.toNumber()).toBe(3);
    expect((await db.screenTimeState.findFirst())?.dailyLimitMinutes).toBe(70);
    await expect(changeStudyMark({ ...input, operation: "edit", expectedValue: 5, value: 4 }, today)).rejects.toThrow("Оценка уже изменена");
    await expect(applyStudyTime(ids.quarterId, 70, today)).rejects.toThrow("Оценки изменились");
    await applyStudyTime(ids.quarterId, 30, today);
    await changeStudyMark({ ...input, operation: "delete", expectedValue: 3 }, today);
    expect((await db.subject.findFirst())?.currentAverage).toBeNull();
    await expect(applyStudyTime(ids.quarterId, 60, today)).rejects.toThrow("Сначала добавьте");
    await changeStudyMark({ ...input, operation: "restore", expectedValue: 3 }, today);
    expect((await db.studyMark.findFirst())?.deletedAt).toBeNull();
    expect((await db.subject.findFirst())?.currentAverage?.toNumber()).toBe(3);
  });
  it("validates marks, quarter, ownership and concurrent additions", async () => {
    const ids = await fixture();
    const input = { ...ids, markId: randomUUID(), operation: "add" as const, value: 1 };
    await expect(changeStudyMark(input, today)).rejects.toThrow("от 2 до 5");
    await expect(changeStudyMark({ ...input, value: 4 }, date("2026-11-01"))).rejects.toThrow("Четверть изменилась");
    await Promise.all([4, 5].map((value) => changeStudyMark({ ...input, markId: randomUUID(), value }, today)));
    expect(await db.studyMark.count()).toBe(2);
    expect((await db.subject.findFirst())?.currentAverage?.toNumber()).toBe(4.5);
    expect(await applyStudyTime(ids.quarterId, 60, today)).toBe(60);
    const other = await db.subject.create({ data: { name: "История", priority: SubjectPriority.NORMAL } });
    const mark = await db.studyMark.findFirstOrThrow();
    await expect(changeStudyMark({ ...input, markId: mark.id, subjectId: other.id, operation: "delete", expectedValue: mark.value }, today)).rejects.toThrow("Оценка уже изменена");
  });
  it("imports preserve undated manual marks and ignore removed ones", async () => {
    const ids = await fixture();
    const first = { ...ids, markId: randomUUID(), operation: "add" as const, value: 5 };
    await changeStudyMark(first, today);
    const removed = { ...first, markId: randomUUID(), value: 2 };
    await changeStudyMark(removed, today);
    await changeStudyMark({ ...removed, operation: "delete", expectedValue: 2 }, today);
    await importStudySheet(db, { rows: [["Предметы", "28.09.2026"], ["Математика", "3"]], source: "test", apply: true, nextWeekStartsOn: date("2026-10-05") });
    expect((await db.subject.findFirst())?.currentAverage?.toNumber()).toBe(4);
    expect(await db.studyMark.count({ where: { deletedAt: null } })).toBe(2);
  });
});

describe("diary import", () => {
  it("previews, repeats safely, corrects only supplied dates and invalidates future decisions", async () => {
    const quarter = await db.academicQuarter.create({ data: { schoolYear: "2026/27", number: 1, startsOn: date("2026-09-01"), endsOn: date("2026-10-31") } });
    const subject = await db.subject.create({ data: { name: "Математика", priority: SubjectPriority.HIGH } });
    await db.studyMark.create({ data: { subjectId: subject.id, quarterId: quarter.id, date: date("2026-09-02"), position: 0, value: 3, source: "earlier" } });
    await db.weekDecision.create({ data: { quarterId: quarter.id, startsOn: date("2026-09-21"), endsOn: date("2026-09-27"), mode: ScreenMode.FULL, dailyLimitMinutes: 120, explanation: "test" } });
    const input = { rows: [["Предметы", "03.09.2026"], ["Математика", "5! 5"]], source: "test.xlsx", nextWeekStartsOn: date("2026-09-21"), apply: false };
    expect((await importStudySheet(db, input)).report[0]).toMatchObject({ imported: 2, total: 3, average: 4.33 });
    expect(await db.studyMark.count()).toBe(1);
    expect((await db.weekDecision.findFirst())?.isStale).toBe(false);
    await importStudySheet(db, { ...input, apply: true });
    await importStudySheet(db, { ...input, apply: true });
    expect(await db.studyMark.count()).toBe(3);
    expect((await db.subject.findUniqueOrThrow({ where: { id: subject.id } })).currentAverage?.toNumber()).toBe(4.33);
    expect((await db.weekDecision.findFirst())?.isStale).toBe(true);
    await importStudySheet(db, { ...input, apply: true, rows: [["Предметы", "03.09.2026"], ["Математика", "4"]] });
    expect(await db.studyMark.count()).toBe(2);
    expect((await db.subject.findUniqueOrThrow({ where: { id: subject.id } })).currentAverage?.toNumber()).toBe(3.5);
    await expect(importStudySheet(db, { ...input, apply: true, rows: [...input.rows, ["Неизвестный предмет", "5"]] })).rejects.toThrow("Не найден предмет");
    expect(await db.studyMark.count()).toBe(2);
    await importStudySheet(db, { ...input, apply: true, rows: [["Предметы", "03.09.2026"], ["Математика", "•"]] });
    expect(await db.studyMark.count()).toBe(1);
    expect((await db.subject.findUniqueOrThrow({ where: { id: subject.id } })).currentAverage?.toNumber()).toBe(3);
  });
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

  it("calculates from available averages and ignores subjects without grades", async () => {
    await family();
    const quarter = await db.academicQuarter.create({ data: { schoolYear: "test", number: 1, startsOn: date("2026-09-01"), endsOn: date("2026-10-31") } });
    await db.screenModeSetting.createMany({ data: [
      { mode: ScreenMode.FULL, dailyLimitMinutes: 120 },
      { mode: ScreenMode.STANDARD, dailyLimitMinutes: 60 },
      { mode: ScreenMode.RECOVERY, dailyLimitMinutes: 30 },
    ] });
    await db.subject.createMany({ data: [
      { name: "Математика partial", priority: SubjectPriority.HIGH, currentAverage: 5, quarterId: quarter.id, sortOrder: 1 },
      { name: "Английский partial", priority: SubjectPriority.HIGH, sortOrder: 2 },
      { name: "Физкультура partial", priority: SubjectPriority.LOW, currentAverage: 3, quarterId: quarter.id, sortOrder: 3 },
    ] });

    const startsOn = date("2026-09-14");
    const result = await calculateStudyModeForQuarter({ quarterId: quarter.id, startsOn, endsOn: date("2026-09-20") });

    expect(result).toEqual({ ok: true });
    expect(await db.weekDecision.findUniqueOrThrow({ where: { startsOn } })).toMatchObject({
      mode: ScreenMode.RECOVERY,
      explanation: expect.stringContaining("Физкультура partial"),
    });
  });

  it("does not calculate a mode when no current-quarter averages exist", async () => {
    await family();
    const quarter = await db.academicQuarter.create({ data: { schoolYear: "test", number: 1, startsOn: date("2026-09-01"), endsOn: date("2026-10-31") } });
    await db.subject.create({ data: { name: "Без оценок test", priority: SubjectPriority.HIGH } });

    expect(await calculateStudyModeForQuarter({
      quarterId: quarter.id,
      startsOn: date("2026-09-14"),
      endsOn: date("2026-09-20"),
    })).toEqual({ noAverages: true });
  });

  it("saves available averages while keeping empty subjects without an average", async () => {
    await family();
    const quarter = await db.academicQuarter.create({ data: { schoolYear: "test", number: 1, startsOn: date("2026-09-01"), endsOn: date("2026-10-31") } });
    const subjects = await Promise.all([
      db.subject.create({ data: { name: "С оценкой test", priority: SubjectPriority.HIGH, sortOrder: 1 } }),
      db.subject.create({ data: { name: "Без оценки save test", priority: SubjectPriority.NORMAL, currentAverage: 4, quarterId: quarter.id, sortOrder: 2 } }),
    ]);

    expect(await saveStudyAveragesForQuarter({
      quarterId: quarter.id,
      nextWeekStartsOn: date("2026-09-14"),
      rawAverages: { [subjects[0].id]: "4,50", [subjects[1].id]: "" },
    })).toBe("saved");

    const saved = await db.subject.findMany({ orderBy: { sortOrder: "asc" }, select: { currentAverage: true, quarterId: true } });
    expect(saved[0].currentAverage?.toNumber()).toBe(4.5);
    expect(saved[0].quarterId).toBe(quarter.id);
    expect(saved[1]).toEqual({ currentAverage: null, quarterId: null });
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
