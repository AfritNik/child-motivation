import { spawn } from "node:child_process";
import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { freePort, run, startTestPostgres } from "./test-postgres.mjs";

const postgres = await startTestPostgres();
const appPort = await freePort();
const env = {
  ...process.env,
  DATABASE_URL: postgres.databaseUrl,
  INTEGRATION_TEST_DATABASE: "true",
  ISOLATED_E2E_TEST: "true",
  AUTH_SECRET: "e2e-only-auth-secret-with-more-than-32-characters",
  LOGIN_THROTTLE_SECRET: "e2e-only-throttle-secret",
  BASE_URL: `http://127.0.0.1:${appPort}`,
  NODE_ENV: "production",
};
let app;

async function waitForApp() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(env.BASE_URL);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js test server did not become ready");
}

async function stopApp() {
  if (!app || app.exitCode !== null) return;
  app.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => app.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!exited && app.exitCode === null) {
    app.kill("SIGKILL");
    await new Promise((resolve) => app.once("exit", resolve));
  }
}

try {
  await run("npx", ["prisma", "migrate", "deploy"], env);
  await run("npx", ["prisma", "db", "seed"], env);
  await run("npx", ["tsx", "tests/e2e/prepare-fixture.ts"], env);
  await run("npm", ["run", "build"], env);
  const standalone = resolve(".next/standalone");
  await cp(resolve("public"), resolve(standalone, "public"), { recursive: true, force: true });
  await cp(resolve(".next/static"), resolve(standalone, ".next/static"), { recursive: true, force: true });
  app = spawn("node", ["server.js"], {
    cwd: standalone,
    env: { ...env, PORT: String(appPort), HOSTNAME: "127.0.0.1" },
    stdio: "inherit",
  });
  await waitForApp();
  await run("npx", ["playwright", "test", "--config", "playwright.config.ts"], env);
} finally {
  await stopApp();
  await postgres.stop();
}
