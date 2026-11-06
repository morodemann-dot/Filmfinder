"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  importBest,
  importListChunk,
  importSimilar,
  saveSettings,
  type ListKey,
} from "@/app/catalog-actions";
import type { FormState } from "@/app/actions";
import type { CatalogSettings, ImportResult } from "@/lib/importer";

const GENRES: [number, string][] = [
  [53, "Thriller"], [80, "Krimi"], [18, "Drama"], [35, "Komödie"], [28, "Action"], [12, "Abenteuer"],
  [878, "Science Fiction"], [14, "Fantasy"], [27, "Horror"], [9648, "Mystery"], [10749, "Liebesfilm"],
  [36, "Historie"], [10752, "Kriegsfilm"], [37, "Western"], [16, "Animation"], [10751, "Familie"],
  [10402, "Musik"], [99, "Dokumentarfilm"],
];
const DECADES: [string, string][] = [["2020", "2020 bis heute"], ["2010", "2010er"], ["2000", "2000er"], ["1990", "1990er"], ["1980", "1980er"]];

function Status({ state }: { state: FormState }) {
  return (
    <>
      {state.error && <p className="error">{state.error}</p>}
      {state.message && (
        <p className="success">
          {state.message}{" "}
          {state.message.includes("Kandidaten") && <Link href="/admin?bereich=pruefen" style={{ textDecoration: "underline" }}>Jetzt prüfen →</Link>}
        </p>
      )}
    </>
  );
}

// Haken "Erst prüfen" – in allen Import-Formularen gleich
export function StageCheckbox() {
  return (
    <label className="row small" style={{ marginBottom: 12 }}>
      <input type="checkbox" name="vorschau" defaultChecked style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
      Erst prüfen (Vorschau) – neue Filme landen erst bei „Neu prüfen“
    </label>
  );
}

// ---------------- Katalog-Regeln ----------------

export function SettingsPanel({ settings }: { settings: CatalogSettings }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettings, {});
  const fmt = settings.min_rating.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <details className="panel" style={{ marginBottom: 16 }}>
      <summary style={{ cursor: "pointer" }}>
        <span className="eyebrow">Katalog-Regeln</span>{" "}
        <span className="caption">ab {fmt} · ab {settings.min_votes.toLocaleString("de-DE")} Stimmen{settings.series_exempt ? " · Reihen vollständig" : ""}</span>
      </summary>
      <p className="caption">
        Gilt für alle Importe. Immer ausgenommen von der Qualitätsschwelle: Oscar-/Golden-Globe-Gewinner, Festival-Gewinner
        und Kritiker-Kanon. Immer aussortiert: Netflix-Produktionen und ausgeschlossene Herkunft (außer Oscar/Globe).
      </p>
      <form action={action}>
        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="label">TMDB-Bewertung mindestens</span>
            <input className="input" name="min_rating" type="number" step={0.1} min={0} max={10} defaultValue={settings.min_rating} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="label">Stimmen mindestens</span>
            <input className="input" name="min_votes" type="number" step={100} min={0} defaultValue={settings.min_votes} />
          </label>
        </div>
        <label className="row small" style={{ marginBottom: 12 }}>
          <input type="checkbox" name="series_exempt" defaultChecked={settings.series_exempt} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
          Filmreihen vollständig importieren (auch schwächere Teile)
        </label>
        <button className="btn primary" disabled={pending}>{pending ? "Speichere …" : "Regeln speichern"}</button>
        <Status state={state} />
      </form>
    </details>
  );
}

// ---------------- Beste nach Genre / Jahrzehnt / Stichwort / Studio ----------------

export function BestForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(importBest, {});
  return (
    <form action={action} className="panel">
      <h2>Die Besten nach Genre, Jahrzehnt, Thema oder Studio</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Sortiert nach Bewertung statt Beliebtheit – nur Filme über der Qualitätsschwelle. Alles ist optional, aber mindestens eins muss gewählt sein.
      </p>
      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="b-genre">Genre</label>
          <select id="b-genre" name="genre" className="select">
            <option value="">Alle</option>
            {GENRES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="b-dec">Jahrzehnt</label>
          <select id="b-dec" name="decade" className="select">
            <option value="">Ab 1980</option>
            {DECADES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="b-kw">Thema / Stichwort (englisch, optional)</label>
        <input id="b-kw" name="keyword" className="input" placeholder="z. B. heist, time travel, neo-noir, survival" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="b-co">Studio / Label (optional)</label>
        <input id="b-co" name="company" className="input" placeholder="z. B. A24, Neon, Searchlight Pictures, Pixar" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="b-reg">Herkunft</label>
        <select id="b-reg" name="region" className="select" defaultValue="west">
          <option value="west">USA, Großbritannien & Westeuropa</option>
          <option value="welt">Weltweit (Herkunfts-Regel gilt trotzdem)</option>
        </select>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="b-from">Ab Seite</label>
          <input id="b-from" name="from" type="number" min={1} defaultValue={1} className="input" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="b-pages">Seiten (je 20, max. 5)</label>
          <input id="b-pages" name="pages" type="number" min={1} max={5} defaultValue={2} className="input" />
        </div>
      </div>
      <StageCheckbox />
      <button className="btn primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Suche … (bis zu 1 Minute)" : "Filme finden"}
      </button>
      <Status state={state} />
    </form>
  );
}

// ---------------- Listen: Festivals, Kanon (in Etappen) ----------------

const LIST_INFO: Record<ListKey, { title: string; text: string }> = {
  festivals: {
    title: "Festival- & BAFTA-Gewinner seit 1980",
    text: "Goldene Palme (Cannes), Goldener Löwe (Venedig), Goldener Bär (Berlinale) und BAFTA-Preise. Quelle: Wikidata. Ausgenommen von der Qualitätsschwelle – Herkunfts-Regel und Netflix-Filter gelten trotzdem.",
  },
  canon: {
    title: "Kritiker-Kanon seit 1980",
    text: "Filme der Criterion Collection und der US National Film Registry (Filme von besonderer kultureller Bedeutung). Quelle: Wikidata. Ausgenommen von der Qualitätsschwelle.",
  },
};

export function ListForm({ list }: { list: ListKey }) {
  const [stage, setStage] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [stats, setStats] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  async function run() {
    setRunning(true); setError(null); setFinished(false);
    let total: ImportResult = { ok: 0, staged: 0, failed: 0, netflix: 0, small: 0, origin: 0, quality: 0 };
    let offset: number | null = 0;
    try {
      while (offset !== null) {
        const r = await importListChunk(list, offset, stage);
        total = {
          ok: total.ok + r.ok, staged: total.staged + r.staged, failed: total.failed + r.failed, netflix: total.netflix + r.netflix,
          small: 0, origin: total.origin + r.origin, quality: total.quality + r.quality,
        };
        setStats(total);
        setProgress({ done: r.next ?? r.total, total: r.total });
        offset = r.next;
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
      <h2>{LIST_INFO[list].title}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>{LIST_INFO[list].text}</p>
      <label className="row small" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={stage} onChange={(e) => setStage(e.target.checked)} disabled={running}
          style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
        Erst prüfen (Vorschau) – neue Filme landen erst bei „Neu prüfen“
      </label>
      <button className="btn primary" style={{ width: "100%" }} onClick={run} disabled={running}>
        {running ? `Lade … ${progress?.done ?? 0} / ${progress?.total ?? "?"}` : "Liste durchgehen"}
      </button>
      {progress && <div className="progress" style={{ marginTop: 14 }}><div style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>}
      {stats && (
        <p className="small">
          {stage ? `${stats.staged} neue Kandidaten` : `${stats.ok} übernommen`}
          {stats.origin > 0 && ` · ${stats.origin} wegen Herkunft übersprungen`}
          {stats.netflix > 0 && ` · ${stats.netflix} Netflix`}
          {stats.failed > 0 && ` · ${stats.failed} fehlgeschlagen`}
        </p>
      )}
      {finished && (
        <p className="success">
          Fertig!{" "}
          {stage && (stats?.staged ?? 0) > 0 && <Link href="/admin?bereich=pruefen" style={{ textDecoration: "underline" }}>Jetzt prüfen →</Link>}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ---------------- Ähnlich zu euren Lieblingsfilmen ----------------

export function SimilarForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(importSimilar, {});
  return (
    <form action={action} className="panel">
      <h2>Ähnlich zu euren Lieblingsfilmen</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Nimmt Filme, die du oder deine Freunde hoch bewertet habt, und holt die von TMDB empfohlenen ähnlichen Filme –
        was öfter empfohlen wird, zuerst. Qualitätsschwelle gilt. Jeder Klick nimmt andere Lieblingsfilme als Ausgangspunkt.
      </p>
      <div className="field">
        <label htmlFor="s-min">Lieblingsfilm = bewertet mit mindestens</label>
        <select id="s-min" name="minScore" className="select" defaultValue="8">
          {[10, 9, 8, 7].map((n) => <option key={n} value={n}>{n} Punkten</option>)}
        </select>
      </div>
      <StageCheckbox />
      <button className="btn primary" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Suche ähnliche Filme …" : "Ähnliche Filme finden"}
      </button>
      <Status state={state} />
    </form>
  );
}
