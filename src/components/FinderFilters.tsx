"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Filterleiste der Filmfinder-Seite: jede Pille öffnet ein Auswahlmenü (auf dem iPhone das gewohnte Auswahlrad).

export type FinderOption = { value: string; label: string; group?: string };
export type FinderFilter = { key: string; label: string; all: string; options: FinderOption[] };

const Chevron = () => (
  <svg className="chev" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
);

export default function FinderFilters({ filters }: { filters: FinderFilter[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const active = filters.filter((f) => sp.get(f.key)).length;

  function set(key: string, value: string | null) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value); else p.delete(key);
    const s = p.toString();
    start(() => router.push(s ? `/?${s}` : "/", { scroll: false }));
  }

  return (
    <div className={`finder-filters ${pending ? "is-pending" : ""}`}>
      {filters.map((f) => {
        const value = sp.get(f.key) ?? "";
        const current = f.options.find((o) => o.value === value);
        const groups = [...new Set(f.options.map((o) => o.group ?? ""))];
        return (
          <label key={f.key} className={`pill ${value ? "on" : ""}`}>
            {current ? current.label : f.label}
            <Chevron />
            <select aria-label={f.label} value={value} onChange={(e) => set(f.key, e.target.value || null)}>
              <option value="">{f.all}</option>
              {groups.map((g) =>
                g ? (
                  <optgroup key={g} label={g}>
                    {f.options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ) : (
                  f.options.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                ),
              )}
            </select>
          </label>
        );
      })}
      {active > 0 && (
        <button className="pill" style={{ background: "transparent", color: "var(--muted)" }} onClick={() => start(() => router.push("/", { scroll: false }))}>
          Zurücksetzen
        </button>
      )}
      {pending && <span className="caption" aria-live="polite">Suche passende Filme …</span>}
    </div>
  );
}
