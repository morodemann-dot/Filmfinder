"use client";

import { useState, useTransition } from "react";
import { setFeedback } from "@/app/actions";
import Score from "./Score";
import type { Status } from "@/lib/types";

// Bewerten und Status setzen auf der Detailseite.
export default function FeedbackControls({
  titleId,
  initialStatus,
  initialRating,
}: {
  titleId: number;
  initialStatus: Status | null;
  initialRating: number | null;
}) {
  const [status, setStatus] = useState<Status | null>(initialStatus);
  const [rating, setRating] = useState<number | null>(initialRating);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save(s: Status | null, r: number | null) {
    const prev = { status, rating };
    setStatus(s);
    setRating(r);
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        await setFeedback(titleId, s, r);
        setSaved(true);
      } catch {
        setStatus(prev.status);
        setRating(prev.rating);
        setError("Konnte nicht gespeichert werden. Bitte nochmal versuchen.");
      }
    });
  }

  const toggle = (s: Status) => (status === s ? save(null, null) : save(s, null));

  return (
    <div className="panel">
      <div className="eyebrow" style={{ marginBottom: 10 }}>Deine Bewertung</div>
      <Score value={status === "gesehen" ? rating : null} onChange={(r) => save("gesehen", r)} hint="Gesehen? Tippe eine Zahl an." />
      <div className="row" style={{ marginTop: 14 }}>
        <button className={`btn ${status === "gesehen" && !rating ? "active" : ""}`} onClick={() => toggle("gesehen")}>
          Gesehen
        </button>
        <button className={`btn ${status === "merkliste" ? "active" : ""}`} onClick={() => toggle("merkliste")}>
          Merkliste
        </button>
        <button className={`btn ${status === "nicht_interessiert" ? "active" : ""}`} onClick={() => toggle("nicht_interessiert")}>
          Kein Interesse
        </button>
        {status && (
          <button className="btn ghost" onClick={() => save(null, null)} disabled={pending}>
            Zurücksetzen
          </button>
        )}
      </div>
      <div className="caption" style={{ minHeight: 18, marginTop: 8 }}>
        {pending ? "Speichere …" : saved ? "✓ Gespeichert" : ""}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
