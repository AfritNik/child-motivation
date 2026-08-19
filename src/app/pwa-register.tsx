"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Установка PWA не должна мешать работе сайта в обычной вкладке.
      });
    }
  }, []);

  return null;
}
