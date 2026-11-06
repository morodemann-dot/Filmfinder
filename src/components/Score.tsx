"use client";

// Bewertung mit Punkten 1–10. Nach dem Antippen leuchtet die Zahl auf
// und darunter steht, was sie bedeutet (z. B. "8 · Sehr gut").

export const SCORE_LABEL: Record<number, string> = {
  1: "Katastrophe",
  2: "Sehr schlecht",
  3: "Schlecht",
  4: "Mäßig",
  5: "Durchschnitt",
  6: "Ganz okay",
  7: "Gut",
  8: "Sehr gut",
  9: "Herausragend",
  10: "Meisterwerk",
};

// Farbe je Punktzahl: rot (schlecht) → gelb → grün (sehr gut)
export function scoreColor(n: number) {
  const hue = Math.round(((n - 1) / 9) * 125); // 0 = rot, 125 = grün
  return `hsl(${hue} 75% 52%)`;
}

export default function Score({
  value,
  onChange,
  disabled,
  hint = "Wie fandest du ihn?",
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <div className="score">
      <div className="score-row" role="radiogroup" aria-label="Bewertung von 1 bis 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} – ${SCORE_LABEL[n]}`}
              disabled={disabled}
              className={on ? "on" : ""}
              style={on ? { background: scoreColor(n), color: "#000" } : undefined}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="score-label" aria-live="polite">
        {value ? (
          <>
            <strong style={{ color: scoreColor(value) }}>{value}</strong> · {SCORE_LABEL[value]}
          </>
        ) : (
          <span className="caption">{hint}</span>
        )}
      </div>
    </div>
  );
}
