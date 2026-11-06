"use client";

import { useState } from "react";
import { finishImdbImport, importImdbChunk, type ImdbItem } from "@/app/actions";

// Liest eine CSV-Datei (mit Anführungszeichen, Kommas in Titeln usw.) in Zeilen ein.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const MOVIE_TYPES = ["movie", "tv movie", "film", "fernsehfilm", "tvmovie"];

type Parsed = { items: ImdbItem[]; skippedSeries: number; skippedOther: number };

function readImdbCsv(text: string): Parsed {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const head = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iId = col("const", "tconst", "imdb id");
  const iRating = col("your rating", "deine bewertung");
  const iType = col("title type", "titeltyp");
  if (iId < 0) throw new Error("Das sieht nicht nach einer IMDb-Export-Datei aus (Spalte „Const“ fehlt).");

  const items: ImdbItem[] = [];
  let skippedSeries = 0;
  let skippedOther = 0;
  for (const r of rows.slice(1)) {
    const id = (r[iId] ?? "").trim();
    if (!/^tt\d+$/.test(id)) continue;
    const type = iType >= 0 ? (r[iType] ?? "").trim().toLowerCase() : "movie";
    if (!MOVIE_TYPES.includes(type)) {
      if (type.includes("series") || type.includes("serie") || type.includes("episode")) skippedSeries++;
      else skippedOther++;
      continue;
    }
    const rating = iRating >= 0 ? Number(r[iRating]) || null : null;
    items.push({ imdbId: id, rating });
  }
  return { items, skippedSeries, skippedOther };
}

const CHUNK = 40;

export default function ImdbImport() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [stats, setStats] = useState({ added: 0, rated: 0, kept: 0, notFound: 0 });
  const [finished, setFinished] = useState(false);

  async function onFile(file: File | undefined) {
    setError(null); setParsed(null); setFinished(false); setDone(0);
    setStats({ added: 0, rated: 0, kept: 0, notFound: 0 });
    if (!file) return;
    try {
      setParsed(readImdbCsv(await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Datei konnte nicht gelesen werden.");
    }
  }

  async function start() {
    if (!parsed) return;
    setRunning(true); setError(null);
    const total = { added: 0, rated: 0, kept: 0, notFound: 0 };
    try {
      for (let i = 0; i < parsed.items.length; i += CHUNK) {
        const r = await importImdbChunk(parsed.items.slice(i, i + CHUNK));
        total.added += r.added; total.rated += r.rated; total.kept += r.kept; total.notFound += r.notFound.length;
        setStats({ ...total });
        setDone(Math.min(parsed.items.length, i + CHUNK));
      }
      await finishImdbImport();
      setFinished(true);
    } catch (e) {
      setError("Abgebrochen: " + (e instanceof Error ? e.message : String(e)) + " – du kannst einfach nochmal starten, schon Erledigtes wird übersprungen.");
    } finally {
      setRunning(false);
    }
  }

  const total = parsed?.items.length ?? 0;

  return (
    <div className="panel">
      <div className="field">
        <label htmlFor="csv">IMDb-Export-Datei (.csv)</label>
        <input id="csv" type="file" accept=".csv,text/csv" className="input" style={{ paddingTop: 10 }}
          onChange={(e) => onFile(e.target.files?.[0])} disabled={running} />
      </div>

      {parsed && (
        <p className="small">
          Gefunden: <strong>{total} Filme</strong>
          {parsed.skippedSeries > 0 && <> · {parsed.skippedSeries} Serien/Folgen werden übersprungen</>}
          {parsed.skippedOther > 0 && <> · {parsed.skippedOther} Sonstiges (Kurzfilme, Videospiele …) übersprungen</>}
        </p>
      )}

      {parsed && total > 0 && !finished && (
        <button className="btn primary" style={{ width: "100%" }} onClick={start} disabled={running}>
          {running ? `Importiere … ${done} / ${total}` : `${total} Filme importieren`}
        </button>
      )}

      {(running || finished) && (
        <>
          <div className="progress" style={{ marginTop: 14 }}>
            <div style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <p className="small">
            {stats.added} neu in den Katalog · {stats.rated} Bewertungen übernommen
            {stats.kept > 0 && <> · {stats.kept} schon in der App bewertet (unverändert)</>}
            {stats.notFound > 0 && <> · {stats.notFound} bei TMDB nicht gefunden</>}
          </p>
        </>
      )}

      {finished && <p className="success">Fertig! Deine Bewertungen findest du in der Bibliothek unter „Gesehen“.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
