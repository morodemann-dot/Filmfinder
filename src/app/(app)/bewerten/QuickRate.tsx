"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Poster from "@/components/Poster";
import Score, { SCORE_LABEL, scoreColor } from "@/components/Score";
import ScaleHelp from "@/components/ScaleHelp";
import { saveAspects, saveFeedbackQuiet as setFeedback, setFavorite, snoozeTitle } from "@/app/actions";
import { AspectSheet, ReasonSheet } from "@/components/QuestionSheet";
import { shouldAskAspects, type ReasonKey } from "@/lib/aspects";
import { useDetailMode } from "@/lib/useDetailMode";
import type { Status } from "@/lib/types";
import { pullRelated, type RateCandidate } from "@/lib/likelySeen";
import { MIN_RATINGS } from "@/lib/onboarding";
import Link from "next/link";

type Answer = { status: Status; rating: number | null };

const ANSWER_TEXT: Record<Status, string> = {
  gesehen: "Gesehen",
  merkliste: "Auf die Merkliste",
  nicht_gesehen: "Nicht gesehen",
  nicht_interessiert: "Kein Interesse",
};

export default function QuickRate({
  titles: initial,
  alreadyDone = 0,
  ratedBefore = 0,
}: {
  titles: RateCandidate[];
  alreadyDone?: number;
  ratedBefore?: number; // schon mit Punkten bewertet (für "x / 10 bis zum Start")
}) {
  // Warteschlange: wird nach "gesehen" um verwandte Filme (gleiche Reihe/Regie) umsortiert.
  const [titles, setTitles] = useState(initial);
  const [because, setBecause] = useState<Record<number, string>>({}); // "Weil du X gesehen hast"
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [flash, setFlash] = useState<Answer | null>(null); // kurze Bestätigung
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detail, setDetail] = useDetailMode();
  const [question, setQuestion] = useState<
    { kind: "reason"; t: RateCandidate } | { kind: "aspect"; t: RateCandidate; rating: number } | null
  >(null);
  const saving = useRef(new Map<number, Promise<unknown>>());
  const [favs, setFavs] = useState<Set<number>>(new Set()); // als Lieblingsfilm markiert (in dieser Runde)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (titles.length === 0) {
    return <div className="empty">Keine Titel mehr zum Bewerten. Der Katalog kann erweitert werden.</div>;
  }

  if (index >= titles.length) {
    return (
      <div className="empty">
        <h2 style={{ color: "var(--text)" }}>Runde geschafft</h2>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={() => setIndex(titles.length - 1)}>Zurück</button>
          <button className="btn primary" onClick={() => window.location.reload()}>Nächste Runde</button>
        </div>
      </div>
    );
  }

  const t = titles[index];
  const current = answers[t.id];

  function answer(status: Status, rating: number | null = null) {
    if (flash) return; // während der Bestätigung keine Doppelklicks
    setError(null);
    const a = { status, rating };
    setAnswers((prev) => ({ ...prev, [t.id]: a }));
    // Gesehen → verwandte Filme direkt als Nächstes zeigen (nur beim ersten Beantworten)
    if (status === "gesehen" && !answers[t.id]) {
      const r = pullRelated(titles, index + 1, t);
      if (r.relatedIds.length) {
        setTitles(r.queue);
        setBecause((prev) => {
          const next = { ...prev };
          for (const id of r.relatedIds) if (!next[id]) next[id] = t.title;
          return next;
        });
      }
    }
    setFlash(a);
    const p = setFeedback(t.id, status, rating).catch(() => setError(`„${t.title}“ konnte nicht gespeichert werden.`));
    saving.current.set(t.id, p);
    start(async () => { await p; });
    // Kurze Fragen: bei klaren Urteilen ab und zu, im ausführlichen Modus immer.
    // Während gefragt wird, bleibt der Film stehen – weiter geht es erst nach der Antwort.
    let asking = false;
    if (status === "gesehen") {
      const r = shouldAskAspects(rating);
      setQuestion(r != null ? { kind: "aspect", t, rating: r } : null);
      asking = r != null;
    } else if (status === "nicht_interessiert" && detail) {
      setQuestion({ kind: "reason", t });
      asking = true;
    } else setQuestion(null);
    // Kurz zeigen, was gewählt wurde – dann weiter
    timer.current = setTimeout(() => {
      setFlash(null);
      if (!asking) setIndex((i) => i + 1);
    }, 650);
  }

  // Nach der Antwort (oder "Überspringen") zum nächsten Film
  function next() {
    if (timer.current) clearTimeout(timer.current);
    setFlash(null);
    setIndex((i) => i + 1);
  }

  function answerReason(r: ReasonKey | null) {
    const q = question;
    setQuestion(null);
    next();
    if (!q || !r) return;
    const after = saving.current.get(q.t.id) ?? Promise.resolve();
    if (r === "spaeter") after.then(() => setFeedback(q.t.id, null, null)).then(() => snoozeTitle(q.t.id, 30)).catch(() => {});
    else after.then(() => setFeedback(q.t.id, "nicht_interessiert", null, r)).catch(() => {});
  }
  function answerAspects(list: string[]) {
    const q = question;
    setQuestion(null);
    next();
    if (!q || !list.length) return;
    (saving.current.get(q.t.id) ?? Promise.resolve()).then(() => saveAspects(q.t.id, list)).catch(() => {});
  }

  function back() {
    if (timer.current) clearTimeout(timer.current);
    setFlash(null);
    if (question) { setQuestion(null); return; } // Frage offen: nur schließen, Film bleibt
    setIndex((i) => Math.max(0, i - 1));
  }

  const shown = flash ?? current;

  return (
    <div className="quick">
      <div className="progress" aria-hidden>
        <div style={{ width: `${(index / titles.length) * 100}%` }} />
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <button className="btn ghost" onClick={back} disabled={index === 0 && !flash} style={{ paddingLeft: 0 }}>
          ‹ Zurück
        </button>
        {(() => {
          const rated = ratedBefore + Object.values(answers).filter((a) => a.rating != null).length;
          if (ratedBefore >= MIN_RATINGS) return <span className="caption">{alreadyDone + Object.keys(answers).length} eingeordnet</span>;
          if (rated < MIN_RATINGS) return <span className="caption goal">{rated} / {MIN_RATINGS} bis zum Start</span>;
          return <Link href="/" className="caption goal done">✓ Filmfinder bereit ›</Link>;
        })()}
      </div>

      <div className="quick-poster">
        <a href={`/titel/${t.id}`} aria-label={`Details zu ${t.title}`}>
          <Poster path={t.poster_path} title={t.title} size="w500" />
        </a>
        {/* Lieblingsfilm: Herz direkt am Plakat */}
        <button className={`quick-fav ${favs.has(t.id) ? "on" : ""}`} aria-pressed={favs.has(t.id)}
          aria-label={favs.has(t.id) ? "Lieblingsfilm – antippen zum Entfernen" : "Als Lieblingsfilm markieren"}
          onClick={() => {
            const on = !favs.has(t.id);
            setFavs((f) => { const n = new Set(f); if (on) n.add(t.id); else n.delete(t.id); return n; });
            const after = saving.current.get(t.id) ?? Promise.resolve();
            saving.current.set(t.id, after.then(() => setFavorite(t.id, on)).catch(() => setError("Lieblingsfilm konnte nicht gespeichert werden (Ergänzung 16?).")));
          }}>
          <span aria-hidden>{favs.has(t.id) ? "♥" : "♡"}</span>
        </button>
        {flash && (
          <div className="flash">
            {flash.rating ? (
              <>
                <div className="flash-num" style={{ color: scoreColor(flash.rating) }}>{flash.rating}</div>
                <div>{SCORE_LABEL[flash.rating]}</div>
              </>
            ) : (
              <div style={{ fontWeight: 700 }}>✓ {ANSWER_TEXT[flash.status]}</div>
            )}
          </div>
        )}
      </div>

      <h2><span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</span></h2>
      <div className="caption quick-meta">
        {current && !flash
          ? <span className="muted">Bereits beantwortet – neue Auswahl überschreibt</span>
          : because[t.id] ? <>Weil du „{because[t.id]}“ gesehen hast</>
            : [t.format, t.release_year, t.genres?.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
      </div>

      <div style={{ margin: "12px 0 10px" }}>
        <Score value={shown?.status === "gesehen" ? shown.rating : null} onChange={(r) => answer("gesehen", r)} hint="Gesehen? Tippe eine Zahl an." />
      </div>

      {/* Alle anderen Antworten in einer Reihe */}
      <div className="quick-acts">
        <button className={`qa ${shown?.status === "gesehen" && !shown.rating ? "on" : ""}`} onClick={() => answer("gesehen")}>
          <span className="qa-icon" aria-hidden>✓</span>Gesehen,<br />ohne Punkte
        </button>
        <button className={`qa ${shown?.status === "nicht_gesehen" ? "on" : ""}`} onClick={() => answer("nicht_gesehen")}>
          <span className="qa-icon" aria-hidden>»</span>Nicht<br />gesehen
        </button>
        <button className={`qa ${shown?.status === "merkliste" ? "on" : ""}`} onClick={() => answer("merkliste")}>
          <span className="qa-icon keep" aria-hidden>+</span>Merk-<br />liste
        </button>
        <button className={`qa ${shown?.status === "nicht_interessiert" ? "on" : ""}`} onClick={() => answer("nicht_interessiert")}>
          <span className="qa-icon remove" aria-hidden>✕</span>Kein<br />Interesse
        </button>
      </div>

      <details className="scale-help">
        <summary>So bewertest du</summary>
        <ScaleHelp />
      </details>
      <label className="detail-toggle">
        <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} />
        <span>
          <strong>Ausführlich bewerten</strong>
          <span className="caption"> – nach jeder Bewertung eine kurze Frage (was hat gefallen / gestört?). So lernt die App schneller.</span>
        </span>
      </label>
      {error && <p className="error">{error}</p>}
      {question?.kind === "reason" && <ReasonSheet title={question.t.title} onDone={answerReason} />}
      {question?.kind === "aspect" && <AspectSheet title={question.t.title} info={question.t} rating={question.rating} onDone={answerAspects} />}
    </div>
  );
}
