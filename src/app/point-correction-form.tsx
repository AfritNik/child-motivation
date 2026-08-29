"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  createPointCorrection,
  type PointCorrectionState,
} from "./point-correction-actions";
import styles from "./page.module.css";

const initialState: PointCorrectionState = {};

export function PointCorrectionForm({ currentBalance, balanceLimit }: { currentBalance: number; balanceLimit: number }) {
  const [state, action, pending] = useActionState(createPointCorrection, initialState);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const amountNumber = Number(amount);
  const nextBalance = currentBalance + amountNumber;
  const valid = Number.isInteger(amountNumber) && amountNumber !== 0 && Math.abs(amountNumber) <= 100 && nextBalance >= 0 && nextBalance <= balanceLimit && note.trim().length >= 2;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const restore = () => openerRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dialog.open) return;
      event.preventDefault();
      dialog.close();
    };
    dialog.addEventListener("close", restore);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      dialog.removeEventListener("close", restore);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, []);

  useEffect(() => {
    if (state.message && dialogRef.current?.open) {
      dialogRef.current.close();
      setAmount("");
      setNote("");
    }
  }, [state]);

  return (
    <div className={styles.correctionForm}>
      <div>
        <label htmlFor="correction-amount">Изменение баллов</label>
        <input id="correction-amount" type="number" min="-100" max="100" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="например, -1 или 2" />
      </div>
      <div>
        <label htmlFor="correction-note">Почему исправляем</label>
        <input id="correction-note" minLength={2} maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Короткая обязательная причина" />
      </div>
      {state.message ? <p className={styles.successMessage} role="status">{state.message}</p> : null}
      <button ref={openerRef} type="button" disabled={!valid} onClick={() => dialogRef.current?.showModal()}>
        Проверить исправление
      </button>
      <dialog ref={dialogRef} className={styles.actionDialog} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); dialogRef.current?.close(); }}>
        <form action={action}>
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="note" value={note} />
          <h2 id={titleId}>Записать исправление?</h2>
          <p id={descriptionId}>Баланс: {currentBalance} → {nextBalance}. Изменение {amountNumber > 0 ? "+" : ""}{amountNumber}. Причина: {note.trim()}.</p>
          {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
          <div className={styles.dialogActions}>
            <button type="button" onClick={() => dialogRef.current?.close()}>Вернуться</button>
            <button type="submit" className={styles.dialogConfirm} disabled={pending}>{pending ? "Записываю…" : "Записать исправление"}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
