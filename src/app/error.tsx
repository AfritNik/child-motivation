"use client";

import { useEffect } from "react";
import styles from "./page.module.css";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.errorPage}>
      <p className={styles.eyebrow}>Не получилось загрузить</p>
      <h1>Что-то пошло не так</h1>
      <p>Данные не потеряны. Попробуй открыть экран ещё раз.</p>
      <button type="button" onClick={reset}>Попробовать снова</button>
    </main>
  );
}
