"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Poster from "./Poster";
import Score from "./Score";
import { setFeedback } from "@/app/actions";

// Der große Vorschlag auf der Filmfinder-Seite als Kartenstapel.
// Links wischen / "Heute nicht" = nächster Vorschlag (nur für jetzt, ändert dein Profil nicht)
// Rechts wischen / "Merken"     = auf die Merkliste
// "Schon gesehen"               = optional gleich 1–10 bewerten

export type Pick = {
  id: number;
  title: string;
  poster_path: string | null;
  meta: string;
  reasons: string[];
};

type Action = "skip" | "merken" | "gesehen";
const THRESHOLD = 90;
const STAMP: Record<Action, string> = { skip: "HEUTE NICHT", merken: "MERKEN", gesehen: "GESEHEN" };

export default function PickDeck({ picks }: { picks: Pick[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<{ pick: Pick; action: Action }[]>([]);
  const [flying, setFlying] = useState<{ pick: Pick; action: Action; from: number }[]>([]);
  const [entering, setEntering] = useState<number | null>(null);
  const [rating, setRating] = useState(false); // "Schon gesehen" → Punkte-Auswahl zeigen
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useRef<{ x: number; moved: boolean } | null>(null);

  // Neue Filterauswahl = neuer Stapel
  const key = picks.map((p) => p.id).join(",");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setIndex(0);
    setHistory([]);
    setRating(false);
  }

  const visible = picks.slice(index, index + 3);
  const current = visible[0];

  function go(action: Action, score: number | null = null) {
    if (!current) return;
    const p = current;
    const dir = action === "merken" || action === "gesehen" ? 1 : -1;
    setFlying((f) => [...f, { pick: p, action, from: dx || dir * 1 }]);
    setTimeout(() => setFlying((f) => f.filter((x) => x.pick.id !== p.id)), 380);
    setIndex((i) => i + 1);
    setDx(0);
    setRating(false);
    setEntering(null);
    setHistory((h) => [...h.slice(-19), { pick: p, action }]);
    if (action !== "skip") {
      setFeedback(p.id, action === "merken" ? "merkliste" : "gesehen", score).catch(() =>
        setError(`„${p.title}“ konnte nicht gespeichert werden.`),
      );
    }
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
    setEntering(last.pick.id);
    setRating(false);
    if (last.action !== "skip") setFeedback(last.pick.id, null, null).catch(() => {});
  }

  // Wischen
  function onDown(e: React.PointerEvent) {
    if (rating) return;
    start.current = { x: e.clientX, moved: false };
    setDragging(true);
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current) return;
    const d = e.clientX - start.current.x;
    if (Math.abs(d) > 6) {
      start.current.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setDx(d);
  }
  function onUp() {
    if (!start.current) return;
    const moved = start.current.moved;
    start.current = null;
    setDragging(false);
    if (dx > THRESHOLD) go("merken");
    else if (dx < -THRESHOLD) go("skip");
    else {
      setDx(0);
      if (!moved && current) router.push(`/titel/${current.id}`); // Tippen = Details
    }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (rating) return;
      if (e.key === "ArrowLeft") go("skip");
      if (e.key === "ArrowRight") go("merken");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const progress = Math.min(1, Math.abs(dx) / THRESHOLD);

  return (
    <div className="pick">
      <div className="deck pick-deck">
        {current ? (
          visible
            .map((p, i) => {
              const depth = i === 1 ? 1 - progress : i;
              const style: React.CSSProperties =
                i === 0
                  ? { transform: `translateX(${dx}px) rotate(${dx / 18}deg)`, transition: dragging ? "none" : "transform 0.25s ease", zIndex: 10 }
                  : { transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.045})`, transition: dragging ? "none" : "transform 0.25s ease", zIndex: 10 - i };
              const enter = i === 0 && entering === p.id;
              return (
                <div
                  key={p.id}
                  className={`swipe-card ${enter ? "enter" : ""}`}
                  style={enter ? { ...style, ["--from-x" as string]: "-700px" } : style}
                  aria-hidden={i > 0}
                  onPointerDown={i === 0 ? onDown : undefined}
                  onPointerMove={i === 0 ? onMove : undefined}
                  onPointerUp={i === 0 ? onUp : undefined}
                  onPointerCancel={i === 0 ? onUp : undefined}
                  onAnimationEnd={enter ? () => setEntering(null) : undefined}
                >
                  {i === 0 && (
                    <>
                      <div className="stamp keep" style={{ opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}>MERKEN</div>
                      <div className="stamp remove" style={{ opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}>HEUTE NICHT</div>
                    </>
                  )}
                  <PickFace p={p} first={index === 0 && i === 0} />
                  {i === 0 && rating && (
                    <div className="rate-sheet" onPointerDown={(e) => e.stopPropagation()}>
                      <div className="eyebrow" style={{ marginBottom: 10 }}>Wie fandest du ihn?</div>
                      <Score value={null} onChange={(n) => go("gesehen", n)} hint="Optional – hilft der App beim Lernen" />
                      <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
                        <button className="btn" onClick={() => go("gesehen")}>Ohne Bewertung</button>
                        <button className="btn ghost" onClick={() => setRating(false)}>Abbrechen</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
            .reverse()
        ) : (
          <div className="empty" style={{ paddingTop: 60 }}>
            Das waren alle passenden Vorschläge für heute.
            {history.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => { setIndex(0); setHistory([]); }}>Nochmal von vorn</button>
              </div>
            )}
          </div>
        )}
        {flying.map((f) => {
          const dir = f.action === "skip" ? -1 : 1;
          return (
            <div
              key={`fly-${f.pick.id}-${f.action}`}
              className="swipe-card fly"
              style={{
                zIndex: 20,
                ["--from-x" as string]: `${f.from}px`,
                ["--from-rot" as string]: `${f.from / 18}deg`,
                ["--to-x" as string]: `${dir * 700}px`,
                ["--to-rot" as string]: `${dir * 28}deg`,
              }}
              aria-hidden
            >
              <div className={`stamp ${dir === 1 ? "keep" : "remove"}`} style={{ opacity: 1 }}>{STAMP[f.action]}</div>
              <PickFace p={f.pick} first={false} />
            </div>
          );
        })}
      </div>

      <div className="swipe-actions pick-actions">
        <button className="round undo" onClick={undo} disabled={history.length === 0} aria-label="Rückgängig" title="Rückgängig">↺</button>
        <button className="pill-btn" onClick={() => go("skip")} disabled={!current || rating}>Heute nicht</button>
        <button className="pill-btn" onClick={() => setRating(true)} disabled={!current || rating}>Schon gesehen</button>
        <button className="round keep" onClick={() => go("merken")} disabled={!current || rating} aria-label="Merken" title="Merken">♥</button>
      </div>
      {error && <p className="error" style={{ textAlign: "center" }}>{error}</p>}
    </div>
  );
}

function PickFace({ p, first }: { p: Pick; first: boolean }) {
  return (
    <>
      <div className="swipe-poster"><Poster path={p.poster_path} title={p.title} size="w500" /></div>
      <div className="swipe-info">
        <div className="eyebrow" style={{ color: "var(--accent)" }}>{first ? "Unser Tipp" : "Vorschlag"}</div>
        <div className="swipe-title">{p.title}</div>
        <div className="caption">{p.meta}</div>
        {p.reasons.length > 0 && <ul className="reasons">{p.reasons.slice(0, 2).map((r) => <li key={r}>{r}</li>)}</ul>}
      </div>
    </>
  );
}
