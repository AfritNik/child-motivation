"use client";

import { useActionState } from "react";
import {
  calculateNextWeekMode,
  saveSubjectAverages,
  type StudyFormState,
} from "./study-actions";
import styles from "./page.module.css";

type EditableSubject = {
  id: string;
  name: string;
  average: number | null;
};

const initialState: StudyFormState = {};

export function StudyAverageForm({
  subjects,
  calculationAllowed,
}: {
  subjects: EditableSubject[];
  calculationAllowed: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState(
    saveSubjectAverages,
    initialState,
  );
  const [calculationState, calculationAction, calculating] = useActionState(
    calculateNextWeekMode,
    initialState,
  );

  return (
    <div className={styles.studyAdminPanel}>
      <form action={saveAction} className={styles.averageForm}>
        <h3>Средние текущей четверти</h3>
        <div className={styles.averageInputs}>
          {subjects.map((subject) => (
            <label key={subject.id}>
              <span>{subject.name}</span>
              <input
                name={`average:${subject.id}`}
                type="text"
                inputMode="decimal"
                pattern="[1-5]([\.,][0-9]{1,2})?"
                defaultValue={subject.average?.toFixed(2) ?? ""}
                placeholder="например, 3,75"
                required
              />
            </label>
          ))}
        </div>
        {saveState.error ? (
          <p className={styles.error} role="alert">{saveState.error}</p>
        ) : null}
        {saveState.message ? (
          <p className={styles.successMessage}>{saveState.message}</p>
        ) : null}
        <button type="submit" disabled={saving}>
          {saving ? "Сохраняю…" : "Сохранить средние"}
        </button>
      </form>

      <form action={calculationAction} className={styles.calculateForm}>
        {calculationState.error ? (
          <p className={styles.error} role="alert">{calculationState.error}</p>
        ) : null}
        {calculationState.message ? (
          <p className={styles.successMessage}>{calculationState.message}</p>
        ) : null}
        <button type="submit" disabled={calculating || !calculationAllowed}>
          {calculating ? "Рассчитываю…" : "Рассчитать следующую неделю"}
        </button>
      </form>
    </div>
  );
}
