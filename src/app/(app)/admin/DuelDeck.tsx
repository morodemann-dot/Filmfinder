"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Poster from "@/components/Poster";
import { duelAnswer, type DuelCard } from "@/app/ki-actions";

// Blindes Modell-Duell: passt der Film zu dir? (fließt NICHT in dein Geschmacksprofil ein)
type Answer = "passt" | "passt_nicht" | "gesehen";
const THRESHOLD = 90;
const STAMP: Record<Answer, string> = { passt: "PASST", passt_nicht: "PASST NICHT", gesehen: "GESEHEN" };

export default function DuelDeck({ cards, onFinished }: { cards: DuelCard[]; onFinished?: () => void }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<DuelCard[]>([]);
  const [flying, setFlying] = useState<{ card: DuelCard; answer: Answer; from: number }[]>([]);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);

  const visible = cards.slice(index, index + 3);
  const current = visible[0];

  function answer(a: Answer) {
    if (!current) return;
    const c = current;
    setFlying((f) => [...f, { card: c, answer: a, from: dx || (a === "passt_nicht" ? -1 : 1) }]);
    setTimeout(() => setFlying((f) => f.filter((x) => x.card.id !== c.id)), 380);
    setIndex((i) => i + 1);
    setDx(0);
    setHistory((h) => [...h.slice(-19), c]);
    duelAnswer(c.id, a).catch(() => setError(`„${c.title}“ konnte nicht gespeichert werden.`));
    if (index + 1 >= cards.length) setTimeout(() => (onFinished ? onFinished() : router.refresh()), 500);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
    duelAnswer(last.id, null).catch(() => {});
  }

  const progress = Math.min(1, Math.abs(dx) / THRESHOLD);

  return (
    <div className="pick">
      <div className="caption" style={{ textAlign: "center", marginBottom: 8 }}>
        {Math.min(index + 1, cards.length)} / {cards.length} · Wischen: rechts = passt, links = passt nicht
      </div>
      <div className="deck pick-deck">
        {current ? (
          visible.map((c, i) => {
            const depth = i === 1 ? 1 - progress : i;
            const style: React.CSSProperties = i === 0
              ? { transform: `translateX(${dx}px) rotate(${dx / 18}deg)`, transition: dragging ? "none" : "transform 0.25s ease", zIndex: 10 }
              : { transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.045})`, transition: dragging ? "none" : "transform 0.25s ease", zIndex: 10 - i };
            return (
              <div key={c.id} className="swipe-card" style={style} aria-hidden={i > 0}
                onPointerDown={i === 0 ? (e) => { setStart(e.clientX); setDragging(true); } : undefined}
                onPointerMove={i === 0 ? (e) => { if (start != null) { setDx(e.clientX - start); if (Math.abs(e.clientX - start) > 6) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } } : undefined}
                onPointerUp={i === 0 ? () => { setStart(null); setDragging(false); if (dx > THRESHOLD) answer("passt"); else if (dx < -THRESHOLD) answer("passt_nicht"); else setDx(0); } : undefined}
                onPointerCancel={i === 0 ? () => { setStart(null); setDragging(false); setDx(0); } : undefined}
              >
                {i === 0 && (
                  <>
                    <div className="stamp keep" style={{ opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}>PASST</div>
                    <div className="stamp remove" style={{ opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}>PASST NICHT</div>
                  </>
                )}
                <Face c={c} />
              </div>
            );
          }).reverse()
        ) : (
          <div className="empty" style={{ paddingTop: 60 }}>Runde geschafft – die Auswertung steht unten.</div>
        )}
        {flying.map((f) => {
          const dir = f.answer === "passt_nicht" ? -1 : 1;
          return (
            <div key={`fly-${f.card.id}`} className="swipe-card fly" aria-hidden
              style={{ zIndex: 20, ["--from-x" as string]: `${f.from}px`, ["--from-rot" as string]: `${f.from / 18}deg`, ["--to-x" as string]: `${dir * 700}px`, ["--to-rot" as string]: `${dir * 28}deg` }}>
              <div className={`stamp ${dir === 1 ? "keep" : "remove"}`} style={{ opacity: 1 }}>{STAMP[f.answer]}</div>
              <Face c={f.card} />
            </div>
          );
        })}
      </div>
      <div className="pick-actions" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <button className="act" onClick={() => answer("passt_nicht")} disabled={!current}>
          <span className="round remove" aria-hidden>✕</span>Passt nicht
        </button>
        <button className="act" onClick={() => answer("gesehen")} disabled={!current}>
          <span className="round seen" aria-hidden>✓</span>Schon gesehen
        </button>
        <button className="act" onClick={() => answer("passt")} disabled={!current}>
          <span className="round keep" aria-hidden>♥</span>Passt zu mir
        </button>
      </div>
      <div style={{ textAlign: "center", marginTop: 6 }}>
        <button className="linkish" onClick={undo} disabled={history.length === 0}>↺ Rückgängig</button>
      </div>
      {error && <p className="error" style={{ textAlign: "center" }}>{error}</p>}
    </div>
  );
}

function Face({ c }: { c: DuelCard }) {
  return (
    <>
      <div className="swipe-poster"><Poster path={c.poster_path} title={c.title} size="w500" /></div>
      <div className="swipe-info">
        <div className="eyebrow" style={{ color: "var(--accent)" }}>Testvorschlag</div>
        <div className="swipe-title">{c.title}</div>
        <div className="caption">{c.meta}</div>
      </div>
    </>
  );
}
