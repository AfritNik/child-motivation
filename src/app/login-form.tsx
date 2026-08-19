"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";
import styles from "./page.module.css";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const [pin, setPin] = useState("");

  return (
    <form action={formAction} className={styles.loginForm}>
      <label htmlFor="pin">Персональный PIN</label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        pattern="[0-9]{4}"
        maxLength={4}
        value={pin}
        onChange={(event) =>
          setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
        }
        aria-describedby={state.error ? "login-error" : undefined}
        autoFocus
      />
      {state.error ? (
        <p id="login-error" className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending || pin.length !== 4}>
        {pending ? "Проверяю…" : "Войти"}
      </button>
    </form>
  );
}
