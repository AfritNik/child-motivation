import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const TEST_QUARTER_ID = "20000000-0000-4000-8000-000000000005";

const sampleAverages = new Map([
  ["Русский язык", 4.1],
  ["Математика", 3.62],
  ["Английский язык", 3.85],
]);

async function loadDemo(): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.academicQuarter.upsert({
      where: { id: TEST_QUARTER_ID },
      update: {
        schoolYear: "тестовая",
        number: 1,
        startsOn: new Date("2026-08-17T00:00:00.000Z"),
        endsOn: new Date("2026-08-31T00:00:00.000Z"),
      },
      create: {
        id: TEST_QUARTER_ID,
        schoolYear: "тестовая",
        number: 1,
        startsOn: new Date("2026-08-17T00:00:00.000Z"),
        endsOn: new Date("2026-08-31T00:00:00.000Z"),
      },
    });

    for (const [name, currentAverage] of sampleAverages) {
      await transaction.subject.update({
        where: { name },
        data: { currentAverage, quarterId: TEST_QUARTER_ID },
      });
    }

    await transaction.weekDecision.deleteMany({
      where: { quarterId: TEST_QUARTER_ID },
    });
  });

  console.log("Тестовая четверть и средние добавлены.");
}

async function clearDemo(): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.weekDecision.deleteMany({
      where: { quarterId: TEST_QUARTER_ID },
    });
    await transaction.subject.updateMany({
      where: { quarterId: TEST_QUARTER_ID },
      data: { currentAverage: null, quarterId: null },
    });
    await transaction.academicQuarter.deleteMany({
      where: { id: TEST_QUARTER_ID },
    });
  });

  console.log("Тестовая четверть, её средние и расчёты удалены.");
}

const command = process.argv[2];

if (command !== "load" && command !== "clear") {
  throw new Error("Use either 'load' or 'clear'");
}

(command === "load" ? loadDemo() : clearDemo())
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
