"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  createSession,
  deleteSession,
  getCurrentUser,
} from "@/lib/auth/session";
import { isPin, verifyPin } from "@/lib/auth/pin";
import {
  clearLoginFailures,
  getLoginBlockRemainingMs,
  recordFailedLogin,
} from "@/lib/auth/login-throttle";

export type LoginState = {
  error?: string;
};

async function getLoginThrottleKey(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "unknown";
  const salt =
    process.env.LOGIN_THROTTLE_SECRET ??
    process.env.AUTH_SECRET ??
    "family-motivation-local-throttle";

  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const pin = formData.get("pin");

  if (typeof pin !== "string" || !isPin(pin)) {
    return { error: "Введите четыре цифры" };
  }

  const throttleKey = await getLoginThrottleKey();
  const blockedForMs = getLoginBlockRemainingMs(throttleKey);

  if (blockedForMs > 0) {
    const minutes = Math.max(1, Math.ceil(blockedForMs / 60_000));
    return { error: `Слишком много попыток. Повторите через ${minutes} мин.` };
  }

  const users = await db.user.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      pinHash: true,
    },
  });
  const matches = await Promise.all(
    users.map((user) => verifyPin(pin, user.pinHash)),
  );
  const user = users[matches.findIndex(Boolean)];

  if (!user) {
    recordFailedLogin(throttleKey);
    return { error: "Неверный PIN" };
  }

  clearLoginFailures(throttleKey);
  await createSession(user.id);
  redirect("/");
}

export async function refreshSession(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  await createSession(user.id);
  return true;
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}
