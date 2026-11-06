"use client";

import { useState, useTransition } from "react";
import Poster from "@/components/Poster";
import Stars from "@/components/Stars";
import { setFeedback } from "@/app/actions";
import type { Status, Title } from "@/lib/types";

export default function QuickRate({ titles: initial }: { titles: Title[] }) {
  // Die Liste wird beim Öffnen einmal "eingefroren", damit sie sich beim Speichern nicht verschiebt.
  const [titles] = useState(initial);
  const [index, setIndex] = useState(0);
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (titles.length === 0) {
    return <div className="empty">Keine Titel mehr zum Bewerten. Der Katalog kann erweitert werden.</div>;
  }

  if (index >= titles.length) {
    return (
      <div className="empty">
        <p>Runde geschafft! 🎬</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Nächste Runde
        </button>
      </div>
    );
  }

  const t = titles[index];

  function answer(status: Status, rating: number | null = null) {
    setError(null);
    setIndex((i) => i + 1); // sofort weiter – gespeichert wird im Hintergrund
    start(async () => {
      try {
        await setFeedback(t.id, status, rating);
      } catch {
        setError(`„${t.title}“ konnte nicht gespeichert werden.`);
      }
    });
  }

  return (
    <div className="quick">
      <div className="progress" aria-hidden>
        <div style={{ width: `${(index / titles.length) * 100}%` }} />
      </div>
      <a href={`/titel/${t.id}`} aria-label={`Details zu ${t.title}`}>
        <Poster path={t.poster_path} title={t.title} size="w500" />
      </a>
      <h2 style={{ marginBottom: 2 }}>{t.title}</h2>
      <div className="muted small">
        {[t.format, t.release_year, t.genres?.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}
      </div>

      <Stars value={null} onChange={(r) => answer("gesehen", r)} />

      <div className="row">
        <button className="btn" onClick={() => answer("nicht_gesehen")}>Nicht gesehen</button>
        <button className="btn" onClick={() => answer("merkliste")}>+ Merkliste</button>
        <button className="btn" onClick={() => answer("nicht_interessiert")}>Kein Interesse</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn ghost small" onClick={() => answer("gesehen")}>Gesehen, ohne Sterne</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
