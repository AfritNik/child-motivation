"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import styles from "./page.module.css";

type HiddenField = { name: string; value: string };
type ActionResult = { ok?: boolean; error?: string } | void;
type DialogState = { version: number; ok?: boolean; error?: string };

function DialogSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={styles.dialogConfirm} disabled={pending}>{pending ? "Сохраняю…" : label}</button>;
}

function useAccessibleDialog(success: boolean | undefined, version: number) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const restoreFocus = () => {
      const target = openerRef.current?.isConnected
        ? openerRef.current
        : document.querySelector<HTMLElement>('[aria-current="page"]');
      target?.focus();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dialog.open) return;
      event.preventDefault();
      dialog.close();
    };
    dialog.addEventListener("close", restoreFocus);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      dialog.removeEventListener("close", restoreFocus);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, []);
  useEffect(() => {
    if (success && dialogRef.current?.open) dialogRef.current.close();
  }, [success, version]);
  return { dialogRef, openerRef };
}

function useDialogAction(action: (formData: FormData) => ActionResult | Promise<ActionResult>) {
  return useActionState(async (previous: DialogState, formData: FormData): Promise<DialogState> => {
    try {
      const result = await action(formData);
      if (result?.error) return { version: previous.version + 1, error: result.error };
      return { version: previous.version + 1, ok: true };
    } catch {
      return { version: previous.version + 1, error: "Не удалось выполнить действие. Попробуйте снова." };
    }
  }, { version: 0 });
}

export function ConfirmActionDialog({ action, fields, triggerLabel, title, description, confirmLabel, triggerClassName }: {
  action: (formData: FormData) => ActionResult | Promise<ActionResult>;
  fields: HiddenField[]; triggerLabel: string; title: string; description: string; confirmLabel: string; triggerClassName?: string;
}) {
  const [state, formAction] = useDialogAction(action);
  const { dialogRef, openerRef } = useAccessibleDialog(state.ok, state.version);
  const [openedVersion, setOpenedVersion] = useState(0);
  const titleId = useId();
  const descriptionId = useId();
  const open = () => { setOpenedVersion(state.version); dialogRef.current?.showModal(); };
  return <>
    <button ref={openerRef} type="button" className={triggerClassName} onClick={open}>{triggerLabel}</button>
    <dialog ref={dialogRef} className={styles.actionDialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); dialogRef.current?.close(); }}>
      <form action={formAction}>
        {fields.map((field, index) => <input key={`${field.name}-${index}`} type="hidden" name={field.name} value={field.value} />)}
        <h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p>
        {state.error && state.version > openedVersion ? <p className={styles.error} role="alert">{state.error}</p> : null}
        <div className={styles.dialogActions}><button type="button" onClick={() => dialogRef.current?.close()}>Вернуться</button><DialogSubmit label={confirmLabel} /></div>
      </form>
    </dialog>
  </>;
}

export function RejectActionDialog({ action, idName, idValue, itemLabel }: {
  action: (formData: FormData) => ActionResult | Promise<ActionResult>; idName: string; idValue: string; itemLabel: string;
}) {
  const [reason, setReason] = useState("");
  const wrappedAction = async (formData: FormData): Promise<ActionResult> => {
    const normalized = String(formData.get("rejectionReason") ?? "").trim();
    if (normalized.length < 2 || normalized.length > 200) return { error: "Причина должна содержать от 2 до 200 символов" };
    formData.set("rejectionReason", normalized);
    return action(formData);
  };
  const [state, formAction] = useDialogAction(wrappedAction);
  const { dialogRef, openerRef } = useAccessibleDialog(state.ok, state.version);
  const [openedVersion, setOpenedVersion] = useState(0);
  const titleId = useId(); const descriptionId = useId();
  return <>
    <button ref={openerRef} type="button" className={styles.rejectTrigger} onClick={() => { setReason(""); setOpenedVersion(state.version); dialogRef.current?.showModal(); }}>Не подтвердить</button>
    <dialog ref={dialogRef} className={styles.actionDialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); dialogRef.current?.close(); }}>
      <form action={formAction}>
        <input type="hidden" name={idName} value={idValue} />
        <h2 id={titleId}>Не подтверждать?</h2><p id={descriptionId}>{itemLabel}. Саша увидит указанную причину.</p>
        <label className={styles.dialogField}><span>Короткая причина</span><input name="rejectionReason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} required autoFocus placeholder="Например, договорились сделать завтра" /></label>
        {state.error && state.version > openedVersion ? <p className={styles.error} role="alert">{state.error}</p> : null}
        <div className={styles.dialogActions}><button type="button" onClick={() => dialogRef.current?.close()}>Вернуться</button><DialogSubmit label="Не подтверждать" /></div>
      </form>
    </dialog>
  </>;
}
