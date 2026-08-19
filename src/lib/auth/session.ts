import "server-only";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { signSessionToken, verifySessionToken } from "./session-token";

const COOKIE_NAME = "family_session";
const SESSION_TTL_SECONDS = 10 * 60;

function getSessionSecret(): string {
  const secret = process.env.AUTH_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return "family-motivation-local-development-only";
  }

  throw new Error("AUTH_SECRET is required in production");
}

export async function createSession(userId: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1_000;
  const token = signSessionToken({ userId, expiresAt }, getSessionSecret());
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    expires: new Date(expiresAt),
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token, getSessionSecret());

  if (!payload) {
    return null;
  }

  return db.user.findFirst({
    where: {
      id: payload.userId,
      isActive: true,
    },
    select: {
      id: true,
      displayName: true,
      role: true,
      pointBalanceLimit: true,
    },
  });
}
