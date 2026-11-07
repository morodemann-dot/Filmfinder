"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Poster from "./Poster";
import Score from "./Score";
import { saveAspects, saveFeedbackQuiet as setFeedback, snoozeTitle } from "@/app/actions";
import { AspectSheet, ReasonSheet } from "./QuestionSheet";
import { shouldAskAspects, type AspectInfo, type ReasonKey } from "@/lib/aspects";

// Der große Vorschlag auf der Filmfinder-Seite als Kartenstapel.
// Links wischen / "Heute nicht" = 7 Tage ausblenden (ändert dein Profil nicht)
// "Kein Interesse"              = wird gespeichert, kurze Frage nach dem Grund (überspringbar)
// Rechts wischen / "Merken"     = auf die Merkliste
// "Schon gesehen"               = optional gleich 1–10 bewerten

export type Pick = {
  id: number;
  title: string;
  poster_path: string | null;
  meta: string;
  reasons: string[];
  info?: AspectInfo; // für konkrete Antwortmöglichkeiten bei den kurzen Fragen
};

type Question = { kind: "reason"; pick: Pick } | { kind: "aspect"; pick: Pick; mode: "pos" | "neg" } | null;

type Action = "skip" | "nein" | "merken" | "gesehen";
const THRESHOLD = 90;
const STAMP: Record<Action, string> = { skip: "HEUTE NICHT", nein: "KEIN INTERESSE", merken: "MERKEN", gesehen: "GESEHEN" };
const STATUS = { nein: "nicht_interessiert", merken: "merkliste", gesehen: "gesehen" } as const;

// deckKey: ändert sich nur, wenn du andere Filter wählst – dann gibt es einen neuen Stapel.
// Sonst bleibt der Stapel stabil, auch wenn die Seite im Hintergrund neu geladen wird.
export default function PickDeck({ picks: incoming, deckKey }: { picks: Pick[]; deckKey: string }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<{ pick: Pick; action: Action }[]>([]);
  const [flying, setFlying] = useState<{ pick: Pick; action: Action; from: number }[]>([]);
  const [entering, setEntering] = useState<number | null>(null);
  const [rating, setRating] = useState(false); // "Schon gesehen" → Punkte-Auswahl zeigen
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const [question, setQuestion] = useState<Question>(null);
  const saving = useRef(new Map<number, Promise<unknown>>()); // damit Antworten erst nach dem Eintrag gespeichert werden
  const fail = (p: Pick) => () => setError(`„${p.title}“ konnte nicht gespeichert werden.`);

  // Neue Filterauswahl = neuer Stapel; sonst die einmal geladene Reihenfolge behalten
  const [picks, setPicks] = useState(incoming);
  const [lastKey, setLastKey] = useState(deckKey);
  if (deckKey !== lastKey) {
    setLastKey(deckKey);
    setPicks(incoming);
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
    if (action === "skip") {
      snoozeTitle(p.id, 7).catch(() => {});
    } else {
      saving.current.set(p.id, setFeedback(p.id, STATUS[action], action === "gesehen" ? score : null).catch(fail(p)));
    }
    if (action === "nein") setQuestion({ kind: "reason", pick: p });
    else if (action === "gesehen") {
      const mode = shouldAskAspects(score);
      setQuestion(mode ? { kind: "aspect", pick: p, mode } : null);
    } else setQuestion(null);
  }

  function answerReason(r: ReasonKey | null) {
    const q = question;
    setQuestion(null);
    if (!q || !r) return;
    const p = q.pick;
    const after = saving.current.get(p.id) ?? Promise.resolve();
    if (r === "spaeter") {
      // "Vielleicht später" = kein dauerhaftes Nein, sondern 30 Tage Pause
      after.then(() => setFeedback(p.id, null, null)).then(() => snoozeTitle(p.id, 30)).catch(fail(p));
    } else {
      after.then(() => setFeedback(p.id, "nicht_interessiert", null, r)).catch(fail(p));
    }
  }

  function answerAspects(list: string[]) {
    const q = question;
    setQuestion(null);
    if (!q || !list.length) return;
    const p = q.pick;
    (saving.current.get(p.id) ?? Promise.resolve()).then(() => saveAspects(p.id, list)).catch(fail(p));
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
    setEntering(last.pick.id);
    setRating(false);
    setQuestion(null);
    if (last.action === "skip") snoozeTitle(last.pick.id, 0).catch(() => {});
    else setFeedback(last.pick.id, null, null).then(() => snoozeTitle(last.pick.id, 0)).catch(() => {});
  }

  // Wischen
  function onDown(e: React.PointerEvent) {
    if (rating) return;
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
    setDragging(true);
  }
  function onMove(e: React.PointerEvent) {
    if (!start.current) return;
    const d = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    // Jede spürbare Bewegung (auch Scrollen nach oben/unten) zählt nicht mehr als Antippen
    if (Math.abs(d) > 6 || Math.abs(dy) > 6) start.current.moved = true;
    if (Math.abs(d) > 6 && Math.abs(d) > Math.abs(dy)) {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setDx(d);
  }
  function onUp(e: React.PointerEvent) {
    if (!start.current) return;
    const { moved, t } = start.current;
    start.current = null;
    setDragging(false);
    if (dx > THRESHOLD) go("merken");
    else if (dx < -THRESHOLD) go("skip");
    else {
      setDx(0);
      // Nur ein echtes, kurzes Antippen öffnet die Details
      if (!moved && e.timeStamp - t < 500 && current) router.push(`/titel/${current.id}`);
    }
  }
  // Geste abgebrochen (z. B. weil iOS das Scrollen übernimmt) = niemals Antippen
  function onCancel() {
    start.current = null;
    setDragging(false);
    setDx(0);
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
                  onPointerCancel={i === 0 ? onCancel : undefined}
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
          const dir = f.action === "skip" || f.action === "nein" ? -1 : 1;
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

      <div className="pick-actions">
        <button className="act" onClick={() => go("nein")} disabled={!current || rating}>
          <span className="round remove" aria-hidden>✕</span>Kein Interesse
        </button>
        <button className="act" onClick={() => go("skip")} disabled={!current || rating}>
          <span className="round" aria-hidden>»</span>Heute nicht
        </button>
        <button className="act" onClick={() => setRating(true)} disabled={!current || rating}>
          <span className="round seen" aria-hidden>✓</span>Schon gesehen
        </button>
        <button className="act" onClick={() => go("merken")} disabled={!current || rating}>
          <span className="round keep" aria-hidden>♥</span>Merken
        </button>
      </div>
      <div style={{ textAlign: "center", marginTop: 6 }}>
        <button className="linkish" onClick={undo} disabled={history.length === 0}>↺ Rückgängig</button>
      </div>
      {error && <p className="error" style={{ textAlign: "center" }}>{error}</p>}
      {question?.kind === "reason" && <ReasonSheet title={question.pick.title} onDone={answerReason} />}
      {question?.kind === "aspect" && (
        <AspectSheet title={question.pick.title} info={question.pick.info ?? {}} mode={question.mode} onDone={answerAspects} />
      )}
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
