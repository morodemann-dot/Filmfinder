"use client";

import { useActionState, useState } from "react";
import RefreshButton from "@/components/RefreshButton";
import { StageCheckbox } from "./SourceForms";
import {
  completeCollections,
  importActor,
  importDirector,
  importFranchise,
  importAwardsChunk,
  importHollywood,
  type AwardsChunkResult,
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
      <StageCheckbox />
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
      <StageCheckbox />
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
      <StageCheckbox />
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
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Katalog pflegen</h2>
      <div style={{ marginBottom: 18 }}>
        <p className="muted small" style={{ marginTop: 0 }}>
          <strong>1. Fehlende Daten laden:</strong> holt Regie, Studios, Filmreihe, Besetzung und TMDB-Bewertung
          für alle Filme nach, bei denen etwas fehlt. Läuft automatisch in Etappen.
        </p>
        <RefreshButton missing={0} label="Fehlende Daten laden" />
      </div>
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

// Import 4: Oscar- und Golden-Globe-Gewinner seit 1980 (läuft automatisch in Etappen)
export function AwardsForm() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [stats, setStats] = useState({ ok: 0, updated: 0, netflix: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  async function run() {
    setRunning(true); setError(null); setFinished(false);
    const total = { ok: 0, updated: 0, netflix: 0, failed: 0 };
    let offset: number | null = 0;
    try {
      while (offset !== null) {
        const r: AwardsChunkResult = await importAwardsChunk(offset, false); // Kurzfilme kommen grundsätzlich nicht in den Katalog
        total.ok += r.ok; total.updated += r.updated; total.netflix += r.netflix; total.failed += r.failed;
        setStats({ ...total });
        offset = r.next;
        setProgress({ done: r.next ?? r.total, total: r.total });
      }
      setFinished(true);
    } catch (e) {
      setError("Abgebrochen: " + (e instanceof Error ? e.message : String(e)) + " – einfach nochmal starten, Vorhandenes wird übersprungen.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Oscar- & Golden-Globe-Gewinner seit 1980</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Alle Filme, die in irgendeiner Kategorie gewonnen haben – auch Preise an Personen für einen Film
        (z. B. „Bester Hauptdarsteller“). Quelle: Wikidata. Netflix-Produktionen und Kurzfilme (unter 45 Min.) werden aussortiert.
        Bei Filmen, die schon im Katalog sind, werden die Preise nachgetragen.
      </p>
      <button className="btn primary" style={{ width: "100%" }} onClick={run} disabled={running}>
        {running ? `Importiere … ${progress?.done ?? 0} / ${progress?.total ?? "?"}` : "Preisträger importieren"}
      </button>
      {progress && (
        <div className="progress" style={{ marginTop: 14 }}>
          <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
      {(running || finished) && (
        <p className="small">
          {stats.ok} neu · {stats.updated} schon vorhanden (Preise ergänzt)
          {stats.netflix > 0 && <> · {stats.netflix} Netflix aussortiert</>}
          {stats.failed > 0 && <> · {stats.failed} fehlgeschlagen</>}
        </p>
      )}
      {finished && <p className="success">Fertig!</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// Import 5: Filme einer Schauspielerin / eines Schauspielers
export function ActorForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(importActor, {});
  return (
    <form action={action} className="panel">
      <h2 style={{ marginTop: 0 }}>Filme einer Schauspielerin / eines Schauspielers</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Spielfilme ab 1980 (ohne Dokus und Gastauftritte als „sie selbst“). Netflix-Produktionen werden aussortiert.
      </p>
      <div className="field">
        <label htmlFor="aname">Name</label>
        <input id="aname" name="name" className="input" placeholder="z. B. Leonardo DiCaprio" required autoComplete="off" />
      </div>
      <label className="row small" style={{ marginBottom: 12 }}>
        <input type="checkbox" name="onlyLead" defaultChecked style={{ width: 20, height: 20 }} />
        Nur Haupt- und große Nebenrollen (die ersten 5 der Besetzungsliste)
      </label>
      <div className="field">
        <label htmlFor="aminVotes">Mindestens so viele Bewertungen bei TMDB</label>
        <input id="aminVotes" name="minVotes" type="number" min={0} step={50} defaultValue={500} className="input" />
      </div>
      <StageCheckbox />
      <button className="btn primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Importiere …" : "Filme hinzufügen"}
      </button>
      <Status state={state} />
    </form>
  );
}
