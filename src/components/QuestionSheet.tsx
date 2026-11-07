"use client";

import { useState } from "react";
import { REASONS, aspectOptions, type AspectInfo, type ReasonKey } from "@/lib/aspects";

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

export function AspectSheet({ title, info, mode, onDone }: {
  title: string; info: AspectInfo; mode: "pos" | "neg"; onDone: (aspects: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const options = aspectOptions(info, mode === "pos");
  const toggle = (k: string) => setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : c.length >= 3 ? c : [...c, k]));
  return (
    <div className="question-sheet" role="dialog" aria-label="Kurze Frage">
      <div className="eyebrow" style={{ marginBottom: 2 }}>{mode === "pos" ? "Was hat dir besonders gefallen?" : "Was hat dich gestört?"}</div>
      <div className="caption" style={{ marginBottom: 8 }}>„{title}“ · bis zu 3 antippen</div>
      <div className="q-chips">
        {options.map((o) => (
          <button key={o.key} className={`q-chip ${chosen.includes(o.key) ? "on" : ""}`} aria-pressed={chosen.includes(o.key)} onClick={() => toggle(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
        <button className="linkish" onClick={() => onDone([])}>Überspringen</button>
        <button className="btn primary" disabled={!chosen.length} onClick={() => onDone(chosen)}>Fertig</button>
      </div>
    </div>
  );
}
