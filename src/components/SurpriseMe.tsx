"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Poster from "./Poster";
import { saveFeedbackQuiet } from "@/app/actions";

export type Surprise = { id: number; title: string; poster_path: string | null; meta: string; why: string; rating: number | null };

type Phase = "idle" | "drop" | "shake" | "burst" | "reveal";

// "Überrasch mich": ein Filmpäckchen wird aufgerissen, heraus kommt ein besonderer Film
export default function SurpriseMe({ pool }: { pool: Surprise[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [film, setFilm] = useState<Surprise | null>(null);
  const [saved, setSaved] = useState(false);
  const seen = useRef<Set<number>>(new Set());
  const timers = useRef<number[]>([]);

  if (pool.length === 0) return null;

  function open() {
    const left = pool.filter((p) => !seen.current.has(p.id));
    const from = left.length ? left : pool;
    if (!left.length) seen.current.clear();
    const f = from[Math.floor(Math.random() * from.length)];
    seen.current.add(f.id);
    setFilm(f); setSaved(false);
    timers.current.forEach(clearTimeout);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm) { setPhase("reveal"); return; }
    setPhase("drop");
    timers.current = [
      window.setTimeout(() => setPhase("shake"), 450),
      window.setTimeout(() => setPhase("burst"), 1650),
      window.setTimeout(() => setPhase("reveal"), 2050),
    ];
    navigator.vibrate?.(30);
  }
  function close() { timers.current.forEach(clearTimeout); setPhase("idle"); }

  return (
    <>
      <button className="surprise-btn" onClick={open}>
        <span className="surprise-spark" aria-hidden>✦</span> Überrasch mich
      </button>

      {phase !== "idle" && film && createPortal(
        <div className={`pack-stage is-${phase}`} role="dialog" aria-modal="true" aria-label="Überraschungsfilm" onClick={(e) => { if (e.target === e.currentTarget && phase === "reveal") close(); }}>
          <div className="pack-rays" aria-hidden />
          <div className="pack-flash" aria-hidden />

          {phase !== "reveal" && (
            <div className="pack" aria-hidden onClick={() => setPhase("burst")}>
              <div className="pack-top"><span>✦ ✦ ✦</span></div>
              <div className="pack-body">
                <div className="pack-logo">Film<span>finder</span></div>
                <div className="pack-sub">Überraschung</div>
              </div>
              <div className="pack-shine" />
            </div>
          )}

          {phase === "reveal" && (
            <div className="reveal">
              <div className="reveal-card">
                <div className="reveal-holo" aria-hidden />
                <Poster path={film.poster_path} title={film.title} size="w500" />
              </div>
              <div className="reveal-info">
                <div className="reveal-kicker">✦ Dein Überraschungsfilm</div>
                <h2>{film.title}</h2>
                <div className="caption">{film.meta}</div>
                <p className="reveal-why">{film.why}</p>
                <div className="reveal-actions">
                  <Link href={`/titel/${film.id}`} className="btn primary">Ansehen ›</Link>
                  <button className="btn" disabled={saved} onClick={() => { setSaved(true); saveFeedbackQuiet(film.id, "merkliste", null).catch(() => setSaved(false)); }}>
                    {saved ? "✓ Gemerkt" : "Merken"}
                  </button>
                </div>
                <div className="reveal-actions">
                  <button className="btn ghost" onClick={open}>Nochmal ↻</button>
                  <button className="btn ghost" onClick={close}>Schließen</button>
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
