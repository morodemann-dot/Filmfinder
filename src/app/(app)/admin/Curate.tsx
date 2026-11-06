"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Poster from "@/components/Poster";
import {
  getCurationBatch,
  keepTitle,
  removeForCuration,
  resetCuration,
  restoreTitle,
  type CurationCard,
  type CurationFilter,
} from "@/app/actions";
import { awardDe, formatRuntime } from "@/lib/types";

// Aussortieren im Tinder-Stil: rechts = behalten, links = entfernen.

const DECADES = [1980, 1990, 2000, 2010, 2020];
const ORDERS = { unbekannt: "Unbekannteste zuerst", zufall: "Zufällig", neu: "Zuletzt hinzugefügt" } as const;
const THRESHOLD = 90; // so weit (in Pixeln) muss man wischen

type Done = { card: CurationCard; action: "keep" | "remove" };

export default function Curate({ genres }: { genres: string[] }) {
  const [filter, setFilter] = useState<CurationFilter>({ order: "unbekannt" });
  const [showFilter, setShowFilter] = useState(false);
  const [cards, setCards] = useState<CurationCard[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Done[]>([]);
  const [stats, setStats] = useState({ keep: 0, remove: 0 });
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const handled = useRef<Set<number>>(new Set());

  const load = useCallback(async (f: CurationFilter, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const r = await getCurationBatch(f, [...handled.current]);
      setCards((prev) => {
        const base = replace ? [] : prev;
        const known = new Set(base.map((c) => c.id));
        return [...base, ...r.cards.filter((c) => !known.has(c.id))];
      });
      setRemaining(r.remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Beim Start und wenn sich Filter ändern: neu laden
  useEffect(() => { void Promise.resolve().then(() => load(filter, true)); }, [filter, load]);

  // Rechtzeitig Nachschub holen
  useEffect(() => {
    if (!loading && cards.length > 0 && cards.length < 6 && (remaining ?? 0) > cards.length)
      void Promise.resolve().then(() => load(filter, false));
  }, [cards.length, loading, remaining, filter, load]);

  const card = cards[0];
  const next = cards[1];

  function decide(action: "keep" | "remove") {
    if (!card || leaving) return;
    const c = card;
    handled.current.add(c.id);
    setLeaving(action === "keep" ? "right" : "left");
    setTimeout(() => {
      setCards((prev) => prev.slice(1));
      setLeaving(null);
      setDx(0);
      setRemaining((r) => (r ? r - 1 : r));
    }, 220);
    setHistory((h) => [...h.slice(-19), { card: c, action }]);
    setStats((s) => ({ ...s, [action]: s[action] + 1 }));
    (action === "keep" ? keepTitle(c.id, true) : removeForCuration(c.id)).catch((e) =>
      setError(`„${c.title}“: ${e instanceof Error ? e.message : String(e)}`),
    );
  }

  async function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setStats((s) => ({ ...s, [last.action]: Math.max(0, s[last.action] - 1) }));
    handled.current.delete(last.card.id);
    try {
      if (last.action === "keep") {
        await keepTitle(last.card.id, false);
        setCards((prev) => [last.card, ...prev]);
      } else {
        // Wiederherstellen bekommt eine neue ID – darum neu laden
        await restoreTitle(last.card.media_type, last.card.tmdb_id);
        await load(filter, true);
      }
      setRemaining((r) => (r ?? 0) + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // --- Wischen mit Finger oder Maus ---
  function onDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current) return;
    setDx(e.clientX - start.current.x);
  }
  function onUp() {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (dx > THRESHOLD) decide("keep");
    else if (dx < -THRESHOLD) decide("remove");
    else setDx(0);
  }

  // Tastatur: ← entfernen, → behalten, Backspace rückgängig
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.key === "ArrowRight") decide("keep");
      if (e.key === "ArrowLeft") decide("remove");
      if (e.key === "Backspace") undo();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const offset = leaving === "right" ? 600 : leaving === "left" ? -600 : dx;
  const activeFilters = (filter.genre ? 1 : 0) + (filter.decade ? 1 : 0) + (filter.noAwards ? 1 : 0);

  return (
    <div className="curate">
      <div className="toolbar">
        <label className="pill">
          {ORDERS[filter.order ?? "unbekannt"]}
          <select value={filter.order} onChange={(e) => setFilter({ ...filter, order: e.target.value as CurationFilter["order"] })} aria-label="Reihenfolge">
            {Object.entries(ORDERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className={`pill ${showFilter ? "on" : ""}`} onClick={() => setShowFilter((s) => !s)}>
          Kategorien {activeFilters > 0 && <span className="count">{activeFilters}</span>}
        </button>
        <span className="caption" style={{ marginLeft: "auto" }}>
          {remaining !== null && `${remaining} ungeprüft`}
        </span>
      </div>

      {showFilter && (
        <div className="sheet">
          <div>
            <div className="label">Genre</div>
            <select className="select" value={filter.genre ?? ""} onChange={(e) => setFilter({ ...filter, genre: e.target.value || undefined })}>
              <option value="">Alle Genres</option>
              {genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <div className="label">Jahrzehnt</div>
            <div className="segmented">
              <button aria-pressed={!filter.decade} onClick={() => setFilter({ ...filter, decade: undefined })}>Alle</button>
              {DECADES.map((d) => (
                <button key={d} aria-pressed={filter.decade === d} onClick={() => setFilter({ ...filter, decade: d })}>
                  {String(d).slice(2)}er
                </button>
              ))}
            </div>
          </div>
          <label className="row small">
            <input type="checkbox" checked={!!filter.noAwards} onChange={(e) => setFilter({ ...filter, noAwards: e.target.checked || undefined })}
              style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
            Nur Filme ohne Oscar/Golden Globe
          </label>
        </div>
      )}

      <div className="deck">
        {next && (
          <div className="swipe-card behind" aria-hidden>
            <Poster path={next.poster_path} title={next.title} size="w342" />
          </div>
        )}
        {card ? (
          <div
            className="swipe-card"
            style={{
              transform: `translateX(${offset}px) rotate(${offset / 18}deg)`,
              transition: dragging ? "none" : "transform 0.22s ease",
            }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div className="stamp keep" style={{ opacity: Math.max(0, Math.min(1, offset / THRESHOLD)) }}>BEHALTEN</div>
            <div className="stamp remove" style={{ opacity: Math.max(0, Math.min(1, -offset / THRESHOLD)) }}>RAUS</div>
            <div className="swipe-poster"><Poster path={card.poster_path} title={card.title} size="w342" /></div>
            <div className="swipe-info">
              <div className="swipe-title">{card.title}</div>
              <div className="caption">
                {[card.media_type === "tv" ? "Serie" : null, card.release_year, formatRuntime(card.runtime_seconds), card.genres.slice(0, 3).join(", ")]
                  .filter(Boolean).join(" · ")}
              </div>
              {(card.directors?.length ?? 0) > 0 && <div className="small" style={{ marginTop: 6 }}><span className="muted">Regie:</span> {card.directors!.join(", ")}</div>}
              {(card.cast_names?.length ?? 0) > 0 && <div className="small"><span className="muted">Mit:</span> {card.cast_names!.slice(0, 3).join(", ")}</div>}
              {(card.oscars?.length ?? 0) > 0 && <div className="small" style={{ marginTop: 4 }}>🏆 {card.oscars!.slice(0, 2).map(awardDe).join(", ")}{card.oscars!.length > 2 ? " …" : ""}</div>}
              {card.overview && <p className="swipe-overview">{card.overview}</p>}
            </div>
          </div>
        ) : (
          <div className="empty" style={{ paddingTop: 80 }}>
            {loading ? "Lade …" : (
              <>
                <p>Alles geprüft{activeFilters > 0 ? " in dieser Kategorie" : ""}. 🎉</p>
                <form action={async () => { await resetCuration(); load(filter, true); }}>
                  <button className="btn">Von vorn beginnen</button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      <div className="swipe-actions">
        <button className="round undo" onClick={undo} disabled={history.length === 0} aria-label="Rückgängig" title="Rückgängig">↺</button>
        <button className="round remove" onClick={() => decide("remove")} disabled={!card} aria-label="Entfernen">✕</button>
        <button className="round keep" onClick={() => decide("keep")} disabled={!card} aria-label="Behalten">✓</button>
      </div>
      <div className="caption" style={{ textAlign: "center", marginTop: 8 }}>
        Diese Runde: {stats.keep} behalten · {stats.remove} entfernt · Entfernte kommen auf die Sperrliste
      </div>
      {error && <p className="error" style={{ textAlign: "center" }}>{error}</p>}
    </div>
  );
}
