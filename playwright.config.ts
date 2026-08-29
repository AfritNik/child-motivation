import { defineConfig, devices } from "@playwright/test";

if (!process.env.BASE_URL) throw new Error("BASE_URL is required; use npm run test:e2e");
const baseUrl = new URL(process.env.BASE_URL);
if (
  process.env.ISOLATED_E2E_TEST !== "true" ||
  process.env.INTEGRATION_TEST_DATABASE !== "true" ||
  baseUrl.protocol !== "http:" ||
  baseUrl.hostname !== "127.0.0.1" ||
  !baseUrl.port
) {
  throw new Error("Playwright refused a non-isolated test server; use npm run test:e2e");
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 8_000 },
  outputDir: "test-results/e2e",
  use: {
    baseURL: process.env.BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
