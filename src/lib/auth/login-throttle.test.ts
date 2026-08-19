import { describe, expect, it } from "vitest";
import {
  clearLoginFailures,
  getLoginBlockRemainingMs,
  recordFailedLogin,
} from "./login-throttle";

describe("login throttle", () => {
  it("blocks after five failures and can be cleared", () => {
    const key = "five-failures";
    clearLoginFailures(key);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordFailedLogin(key, 1_000 + attempt);
    }
    expect(getLoginBlockRemainingMs(key, 5_000)).toBeGreaterThan(0);
    clearLoginFailures(key);
    expect(getLoginBlockRemainingMs(key, 5_000)).toBe(0);
  });

  it("resets an old failure window", () => {
    const key = "expired-window";
    clearLoginFailures(key);
    recordFailedLogin(key, 0);
    expect(getLoginBlockRemainingMs(key, 16 * 60 * 1_000)).toBe(0);
  });
});
