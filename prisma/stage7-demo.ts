import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  DailyCheckType,
  PrismaClient,
} from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const CHILD_ID = "00000000-0000-4000-8000-000000000001";
const CHORE_ID = "30000000-0000-4000-8000-000000000003";
const CHECK_ID = "50000000-0000-4000-8000-000000000001";
const COMPLETION_ID = "50000000-0000-4000-8000-000000000002";
const PRODUCT_ID = "50000000-0000-4000-8000-000000000003";
const DEMO_DATE = new Date("2026-08-17T00:00:00.000Z");

async function clearDemo(): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.pointTransaction.deleteMany({
      where: {
        OR: [
          { dailyCheckId: CHECK_ID },
          { choreCompletionId: COMPLETION_ID },
          { newProductEntryId: PRODUCT_ID },
        ],
      },
    });
    await transaction.dailyCheck.deleteMany({ where: { id: CHECK_ID } });
    await transaction.choreCompletion.deleteMany({ where: { id: COMPLETION_ID } });
    await transaction.newProductEntry.deleteMany({ where: { id: PRODUCT_ID } });
  });
}

async function loadDemo(): Promise<void> {
  await clearDemo();
  await prisma.$transaction([
    prisma.dailyCheck.create({
      data: {
        id: CHECK_ID,
        childId: CHILD_ID,
        date: DEMO_DATE,
        type: DailyCheckType.SELF_DIRECTED_STUDY,
      },
    }),
    prisma.choreCompletion.create({
      data: {
        id: COMPLETION_ID,
        childId: CHILD_ID,
        choreId: CHORE_ID,
        date: DEMO_DATE,
      },
    }),
    prisma.newProductEntry.create({
      data: {
        id: PRODUCT_ID,
        childId: CHILD_ID,
        date: DEMO_DATE,
        name: "Груша (тест)",
      },
    }),
  ]);
  console.log("Тестовый просроченный день добавлен.");
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
