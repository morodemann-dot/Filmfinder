"use client";

import { useState } from "react";
import { REASONS, aspectGroups, aspectTitle, type AspectInfo, type ReasonKey } from "@/lib/aspects";

// Kleine Frage-Leiste, die sich über den Inhalt legt. Immer überspringbar.

export function ReasonSheet({ title, onDone }: { title: string; onDone: (r: ReasonKey | null) => void }) {
  return (
    <div className="question-sheet" role="dialog" aria-label="Warum kein Interesse?">
      <div className="eyebrow" style={{ marginBottom: 8 }}>Warum kein Interesse an „{title}“?</div>
      <div className="q-chips">
        {REASONS.map((r) => (
          <button key={r.key} className="q-chip" onClick={() => onDone(r.key)}>{r.label}</button>
        ))}
      </div>
      <button className="linkish" style={{ marginTop: 8 }} onClick={() => onDone(null)}>Überspringen</button>
    </div>
  );
}

export function AspectSheet({ title, info, rating, onDone, required = false, heading, groupsRating, className = "" }: {
  title: string; info: AspectInfo; rating: number; onDone: (aspects: string[]) => void;
  required?: boolean; heading?: string; groupsRating?: number; className?: string; // für das Einstiegs-Tutorial
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const groups = aspectGroups(info, groupsRating ?? rating);
  const toggle = (k: string) => setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : c.length >= 4 ? c : [...c, k]));
  return (
    <div className={`question-sheet ${className}`} role="dialog" aria-label="Kurze Frage">
      <div className="eyebrow" style={{ marginBottom: 2 }}>{heading ?? aspectTitle(rating)}</div>
      <div className="caption" style={{ marginBottom: 8 }}>„{title}“ · {rating}/10 · bis zu 4 antippen</div>
      <div className="q-scroll">
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginTop: gi ? 10 : 0 }}>
            {g.label && <div className="caption" style={{ fontWeight: 600, marginBottom: 6 }}>{g.label}</div>}
            <div className="q-chips">
              {g.options.map((o) => (
                <button key={o.key} className={`q-chip ${chosen.includes(o.key) ? "on" : ""} ${o.key.startsWith("-") ? "neg" : ""}`}
                  aria-pressed={chosen.includes(o.key)} onClick={() => toggle(o.key)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
        {required ? <span className="caption">mindestens 1 antippen</span> : <button className="linkish" onClick={() => onDone([])}>Überspringen</button>}
        <button className="btn primary" disabled={!chosen.length} onClick={() => onDone(chosen)}>Fertig</button>
      </div>
    </div>
  );
}
