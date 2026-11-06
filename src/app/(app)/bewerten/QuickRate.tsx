"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Poster from "@/components/Poster";
import Score, { SCORE_LABEL, scoreColor } from "@/components/Score";
import { setFeedback } from "@/app/actions";
import type { Status, Title } from "@/lib/types";

type Answer = { status: Status; rating: number | null };

const ANSWER_TEXT: Record<Status, string> = {
  gesehen: "Gesehen",
  merkliste: "Auf die Merkliste",
  nicht_gesehen: "Nicht gesehen",
  nicht_interessiert: "Kein Interesse",
};

export default function QuickRate({ titles: initial }: { titles: Title[] }) {
  // Die Liste wird beim Öffnen einmal "eingefroren", damit sie sich beim Speichern nicht verschiebt.
  const [titles] = useState(initial);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [flash, setFlash] = useState<Answer | null>(null); // kurze Bestätigung
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setFlash(a);
    start(async () => {
      try {
        await setFeedback(t.id, status, rating);
      } catch {
        setError(`„${t.title}“ konnte nicht gespeichert werden.`);
      }
    });
    // Kurz zeigen, was gewählt wurde – dann weiter
    timer.current = setTimeout(() => {
      setFlash(null);
      setIndex((i) => i + 1);
    }, 650);
  }

  function back() {
    if (timer.current) clearTimeout(timer.current);
    setFlash(null);
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
        <span className="caption">{index + 1} / {titles.length}</span>
      </div>

      <div style={{ position: "relative" }}>
        <a href={`/titel/${t.id}`} aria-label={`Details zu ${t.title}`}>
          <Poster path={t.poster_path} title={t.title} size="w500" />
        </a>
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

      <h2 style={{ marginBottom: 2 }}>{t.title}</h2>
      <div className="caption">
        {[t.format, t.release_year, t.genres?.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
      </div>

      <div style={{ margin: "16px 0 14px" }}>
        <Score
          value={shown?.status === "gesehen" ? shown.rating : null}
          onChange={(r) => answer("gesehen", r)}
          hint="Gesehen? Tippe eine Zahl an."
        />
      </div>

      <div className="row">
        <button className={`btn ${shown?.status === "nicht_gesehen" ? "active" : ""}`} onClick={() => answer("nicht_gesehen")}>Nicht gesehen</button>
        <button className={`btn ${shown?.status === "merkliste" ? "active" : ""}`} onClick={() => answer("merkliste")}>Merkliste</button>
        <button className={`btn ${shown?.status === "nicht_interessiert" ? "active" : ""}`} onClick={() => answer("nicht_interessiert")}>Kein Interesse</button>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn ghost" onClick={() => answer("gesehen")}>Gesehen, ohne Bewertung</button>
      </div>
      {current && !flash && (
        <p className="caption">Bereits beantwortet – eine neue Auswahl überschreibt die alte.</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
