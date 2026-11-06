"use client";

// Fünf Sterne mit halben Schritten. Intern speichern wir 1–10 (1 = ½ Stern, 10 = 5 Sterne).
// Linke Hälfte eines Sterns antippen = halber Stern, rechte Hälfte = ganzer Stern.

const PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6-4.9-4.5 6.6-.8z";

function StarIcon({ fill }: { fill: 0 | 0.5 | 1 }) {
  const id = fill === 0.5 ? "half" : undefined;
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {id && (
        <defs>
          <linearGradient id="half">
            <stop offset="50%" stopColor="var(--accent)" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      )}
      <path
        d={PATH}
        fill={fill === 1 ? "var(--accent)" : fill === 0.5 ? "url(#half)" : "transparent"}
        stroke={fill ? "var(--accent)" : "var(--muted)"}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Stars({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const v = value ?? 0;
  return (
    <div className="stars" role="group" aria-label="Bewertung">
      {[1, 2, 3, 4, 5].map((i) => {
        const full = i * 2;
        const fill: 0 | 0.5 | 1 = v >= full ? 1 : v === full - 1 ? 0.5 : 0;
        return (
          <div className="star" key={i}>
            <StarIcon fill={fill} />
            <button
              className="left"
              disabled={disabled}
              aria-label={`${i - 0.5} Sterne`}
              onClick={() => onChange(full - 1)}
            />
            <button
              className="right"
              disabled={disabled}
              aria-label={`${i} Sterne`}
              onClick={() => onChange(full)}
            />
          </div>
        );
      })}
    </div>
  );
}
