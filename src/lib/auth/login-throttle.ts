const WINDOW_MS = 15 * 60 * 1_000;
const BLOCK_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;

type LoginThrottleEntry = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const globalForThrottle = globalThis as unknown as {
  loginThrottle?: Map<string, LoginThrottleEntry>;
};

const entries = globalForThrottle.loginThrottle ?? new Map();
globalForThrottle.loginThrottle = entries;

export function getLoginBlockRemainingMs(
  key: string,
  now = Date.now(),
): number {
  const entry = entries.get(key);
  if (!entry) return 0;

  if (entry.blockedUntil > now) return entry.blockedUntil - now;

  if (now - entry.windowStartedAt >= WINDOW_MS) entries.delete(key);
  return 0;
}

export function recordFailedLogin(key: string, now = Date.now()): void {
  const existing = entries.get(key);
  const entry =
    !existing || now - existing.windowStartedAt >= WINDOW_MS
      ? { failures: 0, windowStartedAt: now, blockedUntil: 0 }
      : existing;

  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) entry.blockedUntil = now + BLOCK_MS;
  entries.set(key, entry);
}

export function clearLoginFailures(key: string): void {
  entries.delete(key);
}
