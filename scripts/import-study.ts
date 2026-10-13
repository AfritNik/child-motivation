import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { importStudySheet } from "../src/lib/study-import-service";
import { getMoscowDateKey } from "../src/lib/domain/daily-cycle";
import { getMoscowWeekRange } from "../src/lib/domain/chores-and-products";

async function main() {
  const file = process.argv[2];
  if (!file || !process.env.DATABASE_URL) throw new Error("Usage: tsx scripts/import-study.ts file.json [--apply]; DATABASE_URL required");
  const input = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(input.rows) || !input.rows.every(Array.isArray) || typeof input.source !== "string") throw new Error("Invalid import JSON");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    console.log(JSON.stringify(await importStudySheet(db, {
      ...input,
      apply: process.argv.includes("--apply"),
      nextWeekStartsOn: getMoscowWeekRange(getMoscowDateKey()).endsBefore,
    }), null, 2));
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
