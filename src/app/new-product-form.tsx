"use client";

import { useActionState } from "react";
import {
  removeNewProduct,
  saveNewProduct,
  type ProductFormState,
} from "./chores-products-actions";
import styles from "./page.module.css";

type NewProductFormProps = {
  name: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | null;
  rejectionReason: string | null;
  earnedPoint: boolean;
  weeklyPoints: number;
};

const initialState: ProductFormState = {};

export function NewProductForm({
  name,
  status,
  rejectionReason,
  earnedPoint,
  weeklyPoints,
}: NewProductFormProps) {
  const [state, formAction, pending] = useActionState(
    saveNewProduct,
    initialState,
  );
  const locked = status === "APPROVED" || status === "REJECTED";

  if (locked) {
    return (
      <div className={styles.productCard}>
        <strong>{name}</strong>
        <p className={styles.itemStatus} data-status={status} role="status">
          {status === "APPROVED"
            ? earnedPoint
              ? "Подтверждено · +1"
              : "Подтверждено · без начисления"
            : `Не подтверждено: ${rejectionReason ?? "причина не указана"}`}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.productCard}>
      <p className={styles.limitHint}>Получено за неделю: {weeklyPoints} из 3</p>
      <form action={formAction} className={styles.productForm}>
        <label htmlFor="new-product">Что нового попробовал?</label>
        <div>
          <input
            id="new-product"
            name="name"
            defaultValue={name}
            minLength={2}
            maxLength={100}
            required
            placeholder="Например, красное яблоко"
          />
          <button type="submit" disabled={pending}>
            {pending ? "Сохраняю…" : status === "PENDING" ? "Обновить" : "Отправить"}
          </button>
        </div>
      </form>
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      {state.saved || status === "PENDING" ? (
        <p
          className={styles.itemStatus}
          data-status="PENDING"
          role="status"
          aria-live="polite"
        >
          Ожидает подтверждения взрослого
        </p>
      ) : null}
      {status === "PENDING" ? (
        <form action={removeNewProduct}>
          <button type="submit" className={styles.cancelRequestButton}>
            Отменить запрос
          </button>
        </form>
      ) : null}
      <small className={styles.safetyNote}>
        Пробуй только то, что заранее согласовано со взрослым.
      </small>
    </div>
  );
}
