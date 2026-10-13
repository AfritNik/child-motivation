import { PrismaPg } from "@prisma/adapter-pg";
import { DailyCheckType, PointReason, PrismaClient } from "../../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || process.env.INTEGRATION_TEST_DATABASE !== "true") throw new Error("E2E fixture requires isolated database");
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" || parsed.port === "5432" || parsed.pathname !== "/family_motivation_integration") {
  throw new Error("E2E fixture refused a non-isolated database");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function prepare() {
  await db.screenTimeState.upsert({ where: { id: 1 }, create: { id: 1, dailyLimitMinutes: 60, explanation: "E2E" }, update: { dailyLimitMinutes: 60, explanation: "E2E" } });
  await db.pointTransaction.deleteMany();
  await db.pointCorrection.deleteMany();
  await db.rewardRequest.deleteMany();
  await db.dailyCheck.deleteMany();
  await db.choreCompletion.deleteMany();
  await db.newProductEntry.deleteMany();
  await db.weekDecision.deleteMany();
  await db.studyMark.deleteMany();
  await db.subject.updateMany({ data: { currentAverage: null, quarterId: null } });
  await db.academicQuarter.deleteMany();
  const quarter = await db.academicQuarter.create({
    data: { schoolYear: "E2E", number: 1, startsOn: new Date("2026-08-01T00:00:00.000Z"), endsOn: new Date("2026-10-31T00:00:00.000Z") },
  });
  await db.subject.updateMany({ data: { currentAverage: 4, quarterId: quarter.id } });
  const maths = await db.subject.findUniqueOrThrow({ where: { name: "Математика" } });
  await db.studyMark.createMany({ data: [3, 5].map((value, position) => ({
    subjectId: maths.id, quarterId: quarter.id, value, position,
    date: new Date("2026-09-03T00:00:00.000Z"), source: "E2E",
  })) });
  const childId = "00000000-0000-4000-8000-000000000001";
  const adminId = "00000000-0000-4000-8000-000000000002";
  const correction = await db.pointCorrection.create({
    data: { userId: childId, createdById: adminId, amount: 30, note: "E2E начальный баланс" },
  });
  await db.pointTransaction.create({
    data: { userId: childId, pointCorrectionId: correction.id, amount: 30, reason: PointReason.CORRECTION },
  });
  await db.dailyCheck.create({
    data: {
      childId,
      date: new Date("2026-08-26T00:00:00.000Z"),
      type: DailyCheckType.PERSONAL_ROUTINE,
    },
  });
}

prepare()
  .then(() => db.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
