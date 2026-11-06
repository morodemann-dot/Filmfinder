"use client";

import { useActionState } from "react";
import { importList, type FormState } from "@/app/actions";

const LISTS = [
  ["movie-popular", "Beliebte Filme"],
  ["movie-top", "Bestbewertete Filme"],
  ["tv-popular", "Beliebte Serien"],
  ["tv-top", "Bestbewertete Serien"],
] as const;

export default function ImportForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(importList, {});
  return (
    <form action={action} className="panel">
      <div className="field">
        <label htmlFor="list">Liste</label>
        <select id="list" name="list" className="input">
          {LISTS.map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="from">Ab Seite</label>
          <input id="from" name="from" type="number" min={1} defaultValue={1} className="input" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="pages">Anzahl Seiten (1–5)</label>
          <input id="pages" name="pages" type="number" min={1} max={5} defaultValue={5} className="input" />
        </div>
      </div>
      <button className="btn primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Importiere … (kann ~30 Sekunden dauern)" : "Importieren"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {state.message && <p className="success">{state.message}</p>}
    </form>
  );
}
