import { startTestPostgres, run } from "./test-postgres.mjs";

const postgres = await startTestPostgres();
const env = {
  ...process.env,
  DATABASE_URL: postgres.databaseUrl,
  INTEGRATION_TEST_DATABASE: "true",
};

try {
  await run("npx", ["prisma", "migrate", "deploy"], env);
  await run("npx", ["vitest", "run", "--config", "vitest.integration.config.mts"], env);
} finally {
  await postgres.stop();
}
