import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionPayload = {
  userId: string;
  expiresAt: number;
};

function createSignature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function signSessionToken(
  payload: SessionPayload,
  secret: string,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createSignature(encodedPayload, secret).toString("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  const [encodedPayload, encodedSignature, extraPart] = token.split(".");

  if (!encodedPayload || !encodedSignature || extraPart) {
    return null;
  }

  const expectedSignature = createSignature(encodedPayload, secret);
  const actualSignature = Buffer.from(encodedSignature, "base64url");

  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;

    if (
      typeof payload.userId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= now
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}
