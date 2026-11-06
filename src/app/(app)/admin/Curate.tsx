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
  const [dragging, setDragging] = useState(false);
  // Karten, die gerade aus dem Stapel fliegen (eigene Elemente, damit nichts "zurückspringt")
  const [flying, setFlying] = useState<{ card: CurationCard; dir: 1 | -1; from: number }[]>([]);
  // Karte, die per "Rückgängig" zurück auf den Stapel fliegt
  const [entering, setEntering] = useState<{ id: number; dir: 1 | -1 } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const handled = useRef<Set<number>>(new Set());

  const busy = useRef(false); // läuft gerade ein Nachladen?
  const generation = useRef(0); // erhöht sich bei jedem Neustart (z. B. Filterwechsel)

  const load = useCallback(async (f: CurationFilter, replace: boolean) => {
    // Nie zwei Nachlade-Vorgänge gleichzeitig – sonst kommen Karten doppelt
    if (!replace && busy.current) return;
    if (replace) generation.current += 1;
    const gen = generation.current;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const r = await getCurationBatch(f, [...handled.current]);
      if (gen !== generation.current) return; // veraltete Antwort (Filter wurde inzwischen geändert)
      setCards((prev) => {
        const base = replace ? [] : prev;
        const known = new Set(base.map((c) => c.id));
        const seenTmdb = new Set(base.map((c) => `${c.media_type}-${c.tmdb_id}`));
        const fresh: CurationCard[] = [];
        for (const c of r.cards) {
          const k = `${c.media_type}-${c.tmdb_id}`;
          // schon entschieden, schon im Stapel oder doppelt in der Lieferung → weglassen
          if (handled.current.has(c.id) || known.has(c.id) || seenTmdb.has(k)) continue;
          known.add(c.id);
          seenTmdb.add(k);
          fresh.push(c);
        }
        return [...base, ...fresh];
      });
      setRemaining(r.remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === generation.current) {
        busy.current = false;
        setLoading(false);
      }
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

  function decide(action: "keep" | "remove") {
    if (!card) return;
    const c = card;
    const dir: 1 | -1 = action === "keep" ? 1 : -1;
    handled.current.add(c.id);
    // Oberste Karte fliegt weg – die darunter liegende ist sofort die neue oberste
    setFlying((f) => [...f, { card: c, dir, from: dx }]);
    setTimeout(() => setFlying((f) => f.filter((x) => x.card.id !== c.id)), 380);
    setCards((prev) => prev.slice(1));
    setDx(0);
    setEntering(null);
    setRemaining((r) => (r ? r - 1 : r));
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
        setEntering({ id: last.card.id, dir: 1 });
        setCards((prev) => [last.card, ...prev]);
        await keepTitle(last.card.id, false);
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

  const progress = Math.min(1, Math.abs(dx) / THRESHOLD); // wie weit die oberste Karte gezogen ist
  const activeFilters = (filter.genre ? 1 : 0) + (filter.decade ? 1 : 0);

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
          <div className="caption">Preisgekrönte Filme werden beim Aussortieren nicht angezeigt.</div>
        </div>
      )}

      <div className="deck">
        {cards.length > 0 ? (
          cards.slice(0, 3).map((c, i) => {
            // i = 0 ist die oberste Karte. Darunter liegende sind etwas kleiner und rücken beim Ziehen nach.
            const depth = i === 1 ? 1 - progress : i;
            const style: React.CSSProperties =
              i === 0
                ? {
                    transform: `translateX(${dx}px) rotate(${dx / 18}deg)`,
                    transition: dragging ? "none" : "transform 0.25s ease",
                    zIndex: 10,
                  }
                : {
                    transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.045})`,
                    transition: dragging ? "none" : "transform 0.25s ease",
                    zIndex: 10 - i,
                  };
            const enter = i === 0 && entering?.id === c.id;
            return (
              <div
                key={c.id}
                className={`swipe-card ${enter ? "enter" : ""}`}
                style={enter ? { ...style, ["--from-x" as string]: `${entering!.dir * 700}px` } : style}
                aria-hidden={i > 0}
                onPointerDown={i === 0 ? onDown : undefined}
                onPointerMove={i === 0 ? onMove : undefined}
                onPointerUp={i === 0 ? onUp : undefined}
                onPointerCancel={i === 0 ? onUp : undefined}
                onAnimationEnd={enter ? () => setEntering(null) : undefined}
              >
                {i === 0 && (
                  <>
                    <div className="stamp keep" style={{ opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}>BEHALTEN</div>
                    <div className="stamp remove" style={{ opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}>RAUS</div>
                  </>
                )}
                <CardFace card={c} />
              </div>
            );
          }).reverse()
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
        {flying.map((f) => (
          <div
            key={`fly-${f.card.id}`}
            className="swipe-card fly"
            style={{
              zIndex: 20,
              ["--from-x" as string]: `${f.from}px`,
              ["--from-rot" as string]: `${f.from / 18}deg`,
              ["--to-x" as string]: `${f.dir * 700}px`,
              ["--to-rot" as string]: `${f.dir * 28}deg`,
            }}
            aria-hidden
          >
            <div className={`stamp ${f.dir === 1 ? "keep" : "remove"}`} style={{ opacity: 1 }}>
              {f.dir === 1 ? "BEHALTEN" : "RAUS"}
            </div>
            <CardFace card={f.card} />
          </div>
        ))}
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

// Inhalt einer Karte (Plakat + Infos)
function CardFace({ card }: { card: CurationCard }) {
  return (
    <>
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
    </>
  );
}
