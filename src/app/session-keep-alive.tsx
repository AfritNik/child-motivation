"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { refreshSession } from "./actions";

const REFRESH_INTERVAL_MS = 60_000;

export function SessionKeepAlive() {
  const router = useRouter();

  useEffect(() => {
    let lastRefreshAt = Date.now();
    let refreshInProgress = false;

    const refreshAfterActivity = async () => {
      const now = Date.now();
      if (
        document.visibilityState === "hidden" ||
        refreshInProgress ||
        now - lastRefreshAt < REFRESH_INTERVAL_MS
      ) {
        return;
      }

      refreshInProgress = true;
      const refreshed = await refreshSession().catch(() => false);
      refreshInProgress = false;

      if (!refreshed) {
        router.refresh();
        return;
      }

      lastRefreshAt = now;
    };

    const options = { passive: true } as const;
    window.addEventListener("pointerdown", refreshAfterActivity, options);
    window.addEventListener("keydown", refreshAfterActivity);
    window.addEventListener("touchstart", refreshAfterActivity, options);
    document.addEventListener("visibilitychange", refreshAfterActivity);

    return () => {
      window.removeEventListener("pointerdown", refreshAfterActivity);
      window.removeEventListener("keydown", refreshAfterActivity);
      window.removeEventListener("touchstart", refreshAfterActivity);
      document.removeEventListener("visibilitychange", refreshAfterActivity);
    };
  }, [router]);

  return null;
}
