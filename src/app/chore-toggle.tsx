"use client";

import { useState, useTransition } from "react";
import { setChoreCompletion } from "./chores-products-actions";
import styles from "./page.module.css";

type ChoreToggleProps = {
  choreId: string;
  name: string;
  instruction: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | null;
  rejectionReason: string | null;
  earnedPoint: boolean;
};

export function ChoreToggle({
  choreId,
  name,
  instruction,
  status,
  rejectionReason,
  earnedPoint,
}: ChoreToggleProps) {
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
      const result = await setChoreCompletion(choreId, nextChecked);

      if (!result.ok) {
        setChecked(previousChecked);
        setError(result.error);
      }
    });
  }

  let statusText = "Не отмечено";

  if (status === "PENDING") statusText = "Ожидает подтверждения";
  if (status === "APPROVED" && earnedPoint) statusText = "Подтверждено · +1";
  if (status === "APPROVED" && !earnedPoint) {
    statusText = "Подтверждено · без начисления";
  }
  if (status === "REJECTED") {
    statusText = `Не подтверждено: ${rejectionReason ?? "причина не указана"}`;
  }

  return (
    <div className={styles.choreItem}>
      <label className={styles.dailyItemLabel}>
        <input
          type="checkbox"
          checked={checked}
          disabled={pending || locked}
          onChange={(event) => changeChecked(event.target.checked)}
        />
        <span>
          <strong>{name}</strong>
          {instruction ? <small>{instruction}</small> : null}
        </span>
        <b>+1</b>
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
