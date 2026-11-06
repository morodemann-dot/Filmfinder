"use client";

import { useActionState, useState } from "react";
import { login, signup, type FormState } from "@/app/actions";

export default function LoginForms() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState<FormState, FormData>(login, {});
  const [signupState, signupAction, signupPending] = useActionState<FormState, FormData>(signup, {});

  const isLogin = mode === "login";
  const state = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: 16 }}>
        <button type="button" className={`btn ${isLogin ? "active" : "ghost"}`} onClick={() => setMode("login")}>
          Anmelden
        </button>
        <button type="button" className={`btn ${!isLogin ? "active" : "ghost"}`} onClick={() => setMode("signup")}>
          Neues Konto
        </button>
      </div>

      <form action={isLogin ? loginAction : signupAction} key={mode}>
        <div className="field">
          <label htmlFor="email">E-Mail</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Passwort {!isLogin && "(mind. 8 Zeichen)"}</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            required
            minLength={isLogin ? undefined : 8}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
        </div>
        {!isLogin && (
          <div className="field">
            <label htmlFor="code">Einladungscode (bekommst du vom Gastgeber)</label>
            <input className="input" id="code" name="code" required autoComplete="off" />
          </div>
        )}
        {state.error && <p className="error">{state.error}</p>}
        <button className="btn primary" style={{ width: "100%", marginTop: 6 }} disabled={pending}>
          {pending ? "Einen Moment …" : isLogin ? "Anmelden" : "Konto anlegen"}
        </button>
      </form>
    </div>
  );
}
