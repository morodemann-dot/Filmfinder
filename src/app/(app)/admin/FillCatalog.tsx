"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fillCatalogYear } from "@/app/catalog-actions";

// "Katalog auffüllen": ein Knopf, die App wählt pro Jahr ab 1990 sinnvolle Filme aus.
const FROM = 1990;
const SAVE_KEY = "ff-auffuellen-jahr";

export default function FillCatalog({ current }: { current: number }) {
  const router = useRouter();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - FROM + 1 }, (_, i) => FROM + i);
  const [target, setTarget] = useState(3000);
  const [running, setRunning] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [added, setAdded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const stop = useRef(false);

  const perYear = Math.ceil(target / years.length);

  async function run() {
    setRunning(true); setError(null); setDone(false); stop.current = false;
    let startAt = FROM;
    try { startAt = Number(localStorage.getItem(SAVE_KEY)) || FROM; } catch {}
    let sum = 0;
    for (const y of years.filter((y) => y >= startAt)) {
      if (stop.current) break;
      setYear(y);
      const r = await fillCatalogYear(y, perYear);
      if (r.error) { setError(`${y}: ${r.error}`); break; }
      sum += r.added;
      setAdded(sum);
      try { localStorage.setItem(SAVE_KEY, String(y + 1)); } catch {}
    }
    if (!stop.current) {
      try { localStorage.removeItem(SAVE_KEY); } catch {}
      setDone(true);
    }
    setRunning(false);
    router.refresh();
  }

  const progress = year ? (year - FROM + 1) / years.length : 0;
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>Katalog auffüllen</div>
      <p className="caption" style={{ marginTop: 0 }}>
        Ein Knopf, keine Einstellungen: Für jedes Jahr ab {FROM} nimmt die App die meistgesehenen (⅔) und die bestbewerteten (⅓) Filme –
        Blockbuster und Kritikerlieblinge gemischt. Deine Regeln gelten (Mindestqualität, keine Kurzfilme, kein Netflix, ausgeschlossene Länder),
        gesperrte Filme bleiben draußen. Aktuell: {current.toLocaleString("de-DE")} Filme.
      </p>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <label className="pill">
          ca. {target.toLocaleString("de-DE")} neue Filme
          <select value={target} disabled={running} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Anzahl">
            {[500, 1000, 2000, 3000, 4000].map((n) => <option key={n} value={n}>ca. {n.toLocaleString("de-DE")} neue Filme</option>)}
          </select>
        </label>
        {running ? (
          <button className="btn" onClick={() => { stop.current = true; }}>Anhalten</button>
        ) : (
          <button className="btn primary" onClick={run}>Auffüllen starten</button>
        )}
      </div>
      {(running || added > 0) && (
        <div style={{ marginTop: 12 }}>
          <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
          <p className="caption" style={{ marginBottom: 0 }}>
            {running ? `Jahr ${year} … ` : done ? "Fertig. " : "Angehalten – beim nächsten Start geht es dort weiter. "}
            {added.toLocaleString("de-DE")} Filme hinzugefügt.
            {running && " Bitte die Seite offen lassen (ca. 5–10 Minuten)."}
          </p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
