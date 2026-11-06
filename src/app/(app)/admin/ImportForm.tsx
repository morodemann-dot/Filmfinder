"use client";

import { useActionState } from "react";
import {
  completeCollections,
  importDirector,
  importFranchise,
  importHollywood,
  refreshOldMovies,
  type FormState,
} from "@/app/actions";

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

// Import 3: Franchise (alle Reihen mit diesem Namen)
export function FranchiseForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(importFranchise, {});
  return (
    <form action={action} className="panel">
      <h2 style={{ marginTop: 0 }}>Franchise hinzufügen</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Holt alle Filmreihen mit diesem Namen. „Spider-Man“ bringt z. B. die Filme mit Tobey Maguire,
        Andrew Garfield, Tom Holland und die Animationsfilme. Tipp: englische Namen funktionieren am besten.
      </p>
      <div className="field">
        <label htmlFor="fname">Name</label>
        <input id="fname" name="name" className="input" placeholder="z. B. Star Wars, Fast & Furious, Batman" required autoComplete="off" />
      </div>
      <label className="row small" style={{ marginBottom: 6 }}>
        <input type="checkbox" name="useKeyword" style={{ width: 20, height: 20 }} />
        Zusätzlich per Stichwort suchen – für Film-Universen, z. B. „marvel cinematic universe“
      </label>
      <div className="field">
        <label htmlFor="fminVotes">Bei Stichwort-Suche: mindestens so viele Bewertungen</label>
        <input id="fminVotes" name="minVotes" type="number" min={0} step={50} defaultValue={300} className="input" />
      </div>
      <button className="btn primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Importiere … (bis zu 1 Minute)" : "Franchise hinzufügen"}
      </button>
      <Status state={state} />
    </form>
  );
}

// Wartung: Reihen vervollständigen und alte Einträge auffrischen
export function MaintenanceForms() {
  const [cState, cAction, cPending] = useActionState<FormState>(completeCollections, {});
  const [rState, rAction, rPending] = useActionState<FormState>(refreshOldMovies, {});
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Katalog pflegen</h2>
      <form action={rAction} style={{ marginBottom: 18 }}>
        <p className="muted small" style={{ marginTop: 0 }}>
          <strong>1. Ältere Filme auffrischen:</strong> lädt Regie, Studios und Filmreihe für Filme nach,
          die vor dieser Funktion importiert wurden. Netflix-Filme werden dabei entfernt.
        </p>
        <button className="btn" disabled={rPending}>{rPending ? "Frische auf …" : "Ältere Filme auffrischen"}</button>
        <Status state={rState} />
      </form>
      <form action={cAction}>
        <p className="muted small" style={{ marginTop: 0 }}>
          <strong>2. Filmreihen vervollständigen:</strong> Ist ein Teil einer Reihe im Katalog (z. B. Sicario),
          kommen die übrigen Teile dazu (Sicario 2). Pro Klick bis zu 10 Reihen.
        </p>
        <button className="btn" disabled={cPending}>{cPending ? "Prüfe Reihen …" : "Filmreihen vervollständigen"}</button>
        <Status state={cState} />
      </form>
    </div>
  );
}
