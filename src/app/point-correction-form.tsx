"use client";

import { useActionState } from "react";
import {
  createPointCorrection,
  type PointCorrectionState,
} from "./point-correction-actions";
import styles from "./page.module.css";

const initialState: PointCorrectionState = {};

export function PointCorrectionForm() {
  const [state, action, pending] = useActionState(
    createPointCorrection,
    initialState,
  );

  return (
    <form action={action} className={styles.correctionForm}>
      <div>
        <label htmlFor="correction-amount">Изменение баллов</label>
        <input
          id="correction-amount"
          name="amount"
          type="number"
          min="-100"
          max="100"
          step="1"
          placeholder="например, -1 или 2"
          required
        />
      </div>
      <div>
        <label htmlFor="correction-note">Почему исправляем</label>
        <input
          id="correction-note"
          name="note"
          minLength={2}
          maxLength={200}
          placeholder="Короткая обязательная причина"
          required
        />
      </div>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.message ? (
        <p className={styles.successMessage}>{state.message}</p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? "Записываю…" : "Записать исправление"}
      </button>
    </form>
  );
}
