"use client";

import { useActionState } from "react";
import { importDirector, importHollywood, type FormState } from "@/app/actions";

const DECADES = [
  ["2020", "2020 bis heute"],
  ["2010", "2010er"],
  ["2000", "2000er"],
  ["1990", "1990er"],
  ["1980", "1980er"],
] as const;

function Status({ state }: { state: FormState }) {
  return (
    <>
      {state.error && <p className="error">{state.error}</p>}
      {state.message && <p className="success">{state.message}</p>}
    </>
  );
}

// Import 1: Hollywood-Filme nach Jahrzehnt
export function HollywoodForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(importHollywood, {});
  return (
    <form action={action} className="panel">
      <h2 style={{ marginTop: 0 }}>Hollywood-Filme nach Jahrzehnt</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        US-Filme (Originalsprache Englisch), sortiert nach Bekanntheit. Netflix-Produktionen werden immer aussortiert.
      </p>
      <div className="field">
        <label htmlFor="decade">Jahrzehnt</label>
        <select id="decade" name="decade" className="input">
          {DECADES.map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="minVotes">Mindestens so viele Bewertungen bei TMDB (höher = nur bekanntere Filme)</label>
        <input id="minVotes" name="minVotes" type="number" min={0} step={100} defaultValue={2000} className="input" />
      </div>
      <label className="row small" style={{ marginBottom: 12 }}>
        <input type="checkbox" name="onlyMajor" defaultChecked style={{ width: 20, height: 20 }} />
        Nur Filme großer Studios (Warner, Universal, Paramount, Disney, A24 …)
      </label>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="from">Ab Seite</label>
          <input id="from" name="from" type="number" min={1} defaultValue={1} className="input" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="pages">Seiten (je 20 Filme, max. 5)</label>
          <input id="pages" name="pages" type="number" min={1} max={5} defaultValue={5} className="input" />
        </div>
      </div>
      <button className="btn primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Importiere … (bis zu 1 Minute)" : "Importieren"}
      </button>
      <Status state={state} />
    </form>
  );
}

// Import 2: alle Filme einer Regie-Person
export function DirectorForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(importDirector, {});
  return (
    <form action={action} className="panel">
      <h2 style={{ marginTop: 0 }}>Filme einer Regisseurin / eines Regisseurs</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Alle Filme ab 1980, bei denen die Person Regie geführt hat. Netflix-Produktionen werden aussortiert.
      </p>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" className="input" placeholder="z. B. Christopher Nolan" required autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="dminVotes">Mindestens so viele Bewertungen bei TMDB</label>
        <input id="dminVotes" name="minVotes" type="number" min={0} step={50} defaultValue={300} className="input" />
      </div>
      <button className="btn primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Importiere …" : "Filme hinzufügen"}
      </button>
      <Status state={state} />
    </form>
  );
}
