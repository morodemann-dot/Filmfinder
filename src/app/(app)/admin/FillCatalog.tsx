"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fillCatalogYear } from "@/app/catalog-actions";

const FAME: [number, string][] = [
  [1500, "Nur sehr bekannte Filme (ab 1.500 Stimmen)"],
  [500, "Auch weniger bekannte (ab 500 Stimmen)"],
  [200, "Auch Geheimtipps (ab 200 Stimmen)"],
];
type Why = { quality: number; origin: number; small: number; short: number; netflix: number; failed: number };
const NOWHY: Why = { quality: 0, origin: 0, small: 0, short: 0, netflix: 0, failed: 0 };

// "Katalog auffüllen": ein Knopf, die App wählt pro Jahr sinnvolle Filme aus.
const SAVE_KEY = "ff-auffuellen-jahr";

export default function FillCatalog({ current }: { current: number }) {
  const router = useRouter();
  const thisYear = new Date().getFullYear();
  const [from, setFrom] = useState(1980);
  const [total, setTotal] = useState(Math.max(5000, Math.ceil((current + 500) / 1000) * 1000));
  const [noKids, setNoKids] = useState(true);
  const [netflix, setNetflix] = useState(true);
  const [minVotes, setMinVotes] = useState(500);
  const [why, setWhy] = useState<Why>(NOWHY);
  const [running, setRunning] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [added, setAdded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const stop = useRef(false);

  const years = Array.from({ length: thisYear - from + 1 }, (_, i) => from + i);
  const wanted = Math.max(0, total - current);
  const perYear = Math.ceil(wanted / years.length);

  async function run() {
    setRunning(true); setError(null); setDone(false); stop.current = false;
    let startAt = from;
    try { const saved = Number(localStorage.getItem(SAVE_KEY)); if (saved >= from && saved <= thisYear) startAt = saved; } catch {}
    let sum = 0;
    let w = { ...NOWHY };
    setWhy(w);
    for (const y of years.filter((y) => y >= startAt)) {
      if (stop.current) break;
      setYear(y);
      const r = await fillCatalogYear(y, perYear, { noKids, allowNetflix: netflix, minVotes });
      if (r.error) { setError(`${y}: ${r.error}`); break; }
      sum += r.added;
      w = Object.fromEntries(Object.keys(w).map((k) => [k, w[k as keyof Why] + ((r.why as Record<string, number>)[k] ?? 0)])) as Why;
      setWhy(w);
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

  const progress = year ? (year - from + 1) / years.length : 0;
  const totals = [4000, 5000, 6000, 7000, 8000].filter((n) => n > current);
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>Katalog auffüllen</div>
      <p className="caption" style={{ marginTop: 0 }}>
        Für jedes Jahr nimmt die App die meistgesehenen (⅔) und die bestbewerteten (⅓) Filme, die noch fehlen – Blockbuster und
        Kritikerlieblinge gemischt. Deine Regeln gelten (Mindestqualität, keine Kurzfilme, ausgeschlossene Länder), gesperrte Filme bleiben draußen.
        Aktuell: <strong>{current.toLocaleString("de-DE")} Filme</strong>.
      </p>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label className="pill">
          bis {total.toLocaleString("de-DE")} Filme
          <select value={total} disabled={running} onChange={(e) => setTotal(Number(e.target.value))} aria-label="Ziel">
            {totals.map((n) => <option key={n} value={n}>bis {n.toLocaleString("de-DE")} Filme insgesamt</option>)}
          </select>
        </label>
        <label className="pill">
          ab {from}
          <select value={from} disabled={running} onChange={(e) => setFrom(Number(e.target.value))} aria-label="Ab Jahr">
            {[1980, 1990, 2000].map((y) => <option key={y} value={y}>ab {y}</option>)}
          </select>
        </label>
        <label className="pill">
          {FAME.find(([n]) => n === minVotes)?.[1].replace(/ \(.*\)/, "")}
          <select value={minVotes} disabled={running} onChange={(e) => setMinVotes(Number(e.target.value))} aria-label="Bekanntheit">
            {FAME.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </select>
        </label>
      </div>
      <p className="caption" style={{ margin: "8px 0 0" }}>
        Bekanntheit = Anzahl Stimmen bei TMDB (Filme vor 2000 brauchen 40 % weniger). Die Mindestbewertung aus deinen Regeln gilt weiter.
      </p>
      <div style={{ display: "grid", gap: 6, margin: "12px 0" }}>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={noKids} disabled={running} onChange={(e) => setNoKids(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
          <span>Ohne Kinderfilme <span className="caption">(Familienfilme, Animation ab 0/6)</span></span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={netflix} disabled={running} onChange={(e) => setNetflix(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
          <span>Netflix-Filme erlauben</span>
        </label>
      </div>
      <p className="caption">
        {wanted > 0 ? <>Etwa <strong>{wanted.toLocaleString("de-DE")} neue Filme</strong>, ca. {perYear} pro Jahr ({from}–{thisYear}).</> : "Ziel ist schon erreicht."}
      </p>
      {running ? (
        <button className="btn" onClick={() => { stop.current = true; }}>Anhalten</button>
      ) : (
        <button className="btn primary" onClick={run} disabled={wanted <= 0}>Auffüllen starten</button>
      )}
      {(running || added > 0) && (
        <div style={{ marginTop: 12 }}>
          <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
          <p className="caption" style={{ marginBottom: 0 }}>
            {running ? `Jahr ${year} … ` : done ? "Fertig. " : "Angehalten – beim nächsten Start geht es dort weiter. "}
            {added.toLocaleString("de-DE")} Filme hinzugefügt.
            {running && " Bitte die Seite offen lassen (ca. 5–10 Minuten)."}
          </p>
          {Object.values(why).some((x) => x > 0) && (
            <p className="caption" style={{ marginBottom: 0 }}>
              Übersprungen: {[
                why.quality && `${why.quality} zu wenig Stimmen/zu schwach bewertet`,
                why.origin && `${why.origin} ausgeschlossene Herkunft`,
                why.small && `${why.small} Kinderfilme`,
                why.short && `${why.short} Kurzfilme`,
                why.netflix && `${why.netflix} Netflix`,
                why.failed && `${why.failed} nicht ladbar`,
              ].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
