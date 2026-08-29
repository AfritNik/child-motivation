"use client";

import { useState, useTransition } from "react";
import { setDailyCheck } from "./daily-actions";
import styles from "./page.module.css";

type DailyCheckToggleProps = {
  type: "SELF_DIRECTED_STUDY" | "PERSONAL_ROUTINE";
  label: string;
  description: string;
  points: number;
  awardedPoints: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | null;
  rejectionReason: string | null;
};

export function DailyCheckToggle({
  type,
  label,
  description,
  points,
  awardedPoints,
  status,
  rejectionReason,
}: DailyCheckToggleProps) {
  const initialChecked = status === "PENDING" || status === "APPROVED";
  const [checked, setChecked] = useState(initialChecked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = status === "APPROVED" || status === "REJECTED";

  function changeChecked(nextChecked: boolean) {
    const previousChecked = checked;
    setChecked(nextChecked);
    setError(null);

    startTransition(async () => {
      const result = await setDailyCheck(type, nextChecked);

      if (!result.ok) {
        setChecked(previousChecked);
        setError(result.error);
      }
    });
  }

  let statusText = "Не отмечено";

  if (status === "PENDING") statusText = "Ожидает подтверждения";
  if (status === "APPROVED") {
    statusText =
      awardedPoints === null
        ? "Подтверждено · без начисления"
        : `Подтверждено · +${awardedPoints}`;
  }
  if (status === "REJECTED") {
    statusText = `Не подтверждено: ${rejectionReason ?? "причина не указана"}`;
  }

  return (
    <div className={styles.dailyItem}>
      <label className={styles.dailyItemLabel}>
        <input
          type="checkbox"
          checked={checked}
          disabled={pending || locked}
          onChange={(event) => changeChecked(event.target.checked)}
        />
        <span>
          <strong>{label}</strong>
          <small>{description}</small>
        </span>
        <b>+{points}</b>
      </label>
      <p
        className={styles.itemStatus}
        data-status={status ?? "EMPTY"}
        role="status"
        aria-live="polite"
      >
        {pending ? "Сохраняю…" : statusText}
      </p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
