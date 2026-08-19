import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "./session-token";

const secret = "test-session-secret";

describe("session token", () => {
  it("returns a valid unexpired payload", () => {
    const token = signSessionToken(
      { userId: "user-1", expiresAt: 2_000 },
      secret,
    );

    expect(verifySessionToken(token, secret, 1_000)).toEqual({
      userId: "user-1",
      expiresAt: 2_000,
    });
  });

  it("rejects an expired token", () => {
    const token = signSessionToken(
      { userId: "user-1", expiresAt: 2_000 },
      secret,
    );

    expect(verifySessionToken(token, secret, 2_000)).toBeNull();
  });

  it("rejects a token changed by the browser", () => {
    const token = signSessionToken(
      { userId: "user-1", expiresAt: 2_000 },
      secret,
    );
    const changedToken = `${token.slice(0, -1)}x`;

    expect(verifySessionToken(changedToken, secret, 1_000)).toBeNull();
  });
});
