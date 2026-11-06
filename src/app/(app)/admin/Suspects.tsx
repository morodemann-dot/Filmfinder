"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Poster from "@/components/Poster";
import RefreshButton from "@/components/RefreshButton";
import Curate from "./Curate";
import { deleteTitles, getSuspects, keepTitle, type Suspect } from "@/app/actions";

// Verdachtsfälle: die App schlägt Filme zum Aussortieren vor – du bestätigst.
export default function Suspects({ genres }: { genres: string[] }) {
  const [mode, setMode] = useState<"liste" | "tindern">("liste");
  const [minRating, setMinRating] = useState(6.0);
  const [minVotes, setMinVotes] = useState(1000);
  const [list, setList] = useState<Suspect[] | null>(null);
  const [missing, setMissing] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: number, v: number) => {
    setError(null);
    try {
      const res = await getSuspects(r, v);
      setList(res.list);
      setMissing(res.missing);
      setSelected(new Set());
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(minRating, minVotes), 350); // kurz warten, während getippt wird
    return () => clearTimeout(t);
  }, [minRating, minVotes, load]);

  const allSelected = !!list?.length && list.every((s) => selected.has(s.id));
  const fmt = useMemo(() => (n: number | null) => n == null ? "–" : n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), []);

  function toggle(id: number) {
    setConfirming(false);
    setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function keep(id: number) {
    setList((l) => l?.filter((s) => s.id !== id) ?? null);
    setSelected((p) => { const n = new Set(p); n.delete(id); return n; });
    keepTitle(id, true).catch((e) => setError(String(e)));
  }

  function removeOne(id: number) {
    setList((l) => l?.filter((s) => s.id !== id) ?? null);
    deleteTitles([id], true).catch((e) => setError(String(e)));
  }

  function removeSelected() {
    const ids = [...selected];
    start(async () => {
      try {
        const r = await deleteTitles(ids, true);
        setMessage(`${r.deleted} Filme entfernt und gesperrt.`);
        setList((l) => l?.filter((s) => !selected.has(s.id)) ?? null);
        setSelected(new Set());
        setConfirming(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div>
      <p className="caption" style={{ marginTop: 0 }}>
        Filme, die schwach bewertet oder kaum bekannt sind (laut TMDB). Preisträger und Filme, die du beim
        Aussortieren behalten hast, sind nie dabei. „Behalten“ heißt: kommt hier nicht wieder.
      </p>

      {missing > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Bewertungen fehlen noch</div>
          <p className="caption" style={{ marginTop: 0 }}>
            Für {missing} Filme fehlen die TMDB-Bewertungen – sie können erst danach geprüft werden. Dauert ein paar Minuten, Seite offen lassen.
          </p>
          <RefreshButton missing={missing} label="Bewertungen laden" />
        </div>
      )}

      <div className="sheet" style={{ margin: "0 0 14px" }}>
        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1, margin: 0 }}>
            <span className="label">Bewertung unter</span>
            <input className="input" type="number" step={0.1} min={0} max={10} value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value) || 0)} />
          </label>
          <label className="field" style={{ flex: 1, margin: 0 }}>
            <span className="label">oder weniger Stimmen als</span>
            <input className="input" type="number" step={100} min={0} value={minVotes}
              onChange={(e) => setMinVotes(Number(e.target.value) || 0)} />
          </label>
        </div>
      </div>

      <div className="segmented" style={{ maxWidth: 320, margin: "0 0 16px" }}>
        <button aria-pressed={mode === "liste"} onClick={() => { setMode("liste"); load(minRating, minVotes); }}>Liste</button>
        <button aria-pressed={mode === "tindern"} onClick={() => setMode("tindern")}>Tindern</button>
      </div>

      {mode === "tindern" ? (
        <Curate key={`${minRating}-${minVotes}`} genres={genres} suspect={{ minRating, minVotes }} />
      ) : (
      <>
      {list && list.length > 0 && (
        <div className="toolbar">
          <span className="caption">{list.length} Verdachtsfälle{selected.size > 0 && ` · ${selected.size} ausgewählt`}</span>
          <button className="pill" style={{ marginLeft: "auto" }} onClick={() => { setConfirming(false); setSelected(allSelected ? new Set() : new Set(list.map((s) => s.id))); }}>
            {allSelected ? "Auswahl aufheben" : "Alle auswählen"}
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
          {!confirming ? (
            <button className="btn danger" style={{ width: "100%" }} onClick={() => setConfirming(true)}>
              {selected.size} Filme entfernen
            </button>
          ) : (
            <div className="row">
              <button className="btn danger" onClick={removeSelected} disabled={pending}>
                {pending ? "Entferne …" : `Ja, ${selected.size} endgültig entfernen`}
              </button>
              <button className="btn" onClick={() => setConfirming(false)}>Abbrechen</button>
            </div>
          )}
          <div className="caption" style={{ marginTop: 6 }}>Entfernte Filme kommen auf die Sperrliste.</div>
        </div>
      )}
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {list === null ? (
        <div className="empty">Lade …</div>
      ) : list.length === 0 ? (
        <div className="empty">Keine Verdachtsfälle bei diesen Grenzen. 👍</div>
      ) : (
        <div className="manage-list">
          {list.map((s) => (
            <div key={s.id} className="manage-item suspect">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`${s.title} auswählen`} />
              <Poster path={s.poster_path} title="" size="w185" />
              <a href={`/titel/${s.id}`} style={{ minWidth: 0 }}>
                <div className="manage-title">{s.title}</div>
                <div className="caption">
                  {[s.release_year, s.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
                </div>
                <div className="suspect-why">
                  TMDB {fmt(s.vote_average)} · {(s.vote_count ?? 0).toLocaleString("de-DE")} Stimmen
                  {s.reasons.length > 0 && <> — {s.reasons.map((r) => r.split(":")[0]).join(" & ")}</>}
                </div>
              </a>
              <div className="suspect-actions">
                <button className="mini keep" onClick={() => keep(s.id)} title="Behalten">Behalten</button>
                <button className="mini remove" onClick={() => removeOne(s.id)} title="Entfernen">Raus</button>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
