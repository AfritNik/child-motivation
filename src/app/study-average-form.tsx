"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  const initialValues = Object.fromEntries(subjects.map((subject) => [subject.id, subject.average?.toFixed(2) ?? ""]));
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [savedValues, setSavedValues] = useState<Record<string, string>>(initialValues);
  const submittedValues = useRef<Record<string, string> | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [saveState, saveAction, saving] = useActionState(
    saveSubjectAverages,
    initialState,
  );
  const [calculationState, calculationAction, calculating] = useActionState(
    calculateNextWeekMode,
    initialState,
  );
  const dirty = subjects.some((subject) => values[subject.id] !== savedValues[subject.id]);

  useEffect(() => {
    if (saveState.message && submittedValues.current) {
      setSavedValues(submittedValues.current);
      submittedValues.current = null;
    }
    if (saveState.error) firstInputRef.current?.focus();
  }, [saveState]);

  return (
    <div className={styles.studyAdminPanel}>
      <form action={saveAction} className={styles.averageForm} onSubmit={() => { submittedValues.current = { ...values }; }}>
        <h3>Средние текущей четверти</h3>
        <div className={styles.averageInputs}>
          {subjects.map((subject, index) => (
            <label key={subject.id}>
              <span>{subject.name}</span>
              <input
                name={`average:${subject.id}`}
                type="text"
                inputMode="decimal"
                pattern="[1-5]([\.,][0-9]{1,2})?"
                ref={index === 0 ? firstInputRef : undefined}
                value={values[subject.id]}
                onChange={(event) => setValues((current) => ({ ...current, [subject.id]: event.target.value }))}
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
          <p className={styles.successMessage} role="status">{saveState.message}</p>
        ) : null}
        <button type="submit" disabled={saving}>
          {saving ? "Сохраняю…" : "Сохранить средние"}
        </button>
      </form>

      <form action={calculationAction} className={styles.calculateForm}>
        {dirty ? <p className={styles.saveFirstMessage} role="status">Сначала сохраните изменённые средние</p> : null}
        {calculationState.error ? (
          <p className={styles.error} role="alert">{calculationState.error}</p>
        ) : null}
        {calculationState.message ? (
          <p className={styles.successMessage} role="status">{calculationState.message}</p>
        ) : null}
        <button type="submit" disabled={calculating || !calculationAllowed || dirty}>
          {calculating ? "Рассчитываю…" : "Рассчитать следующую неделю"}
        </button>
      </form>
    </div>
  );
}
