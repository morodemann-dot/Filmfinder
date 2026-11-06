"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Filterleiste im Apple-Stil: links "Sortierung" (Auswahlmenü), rechts "Filter" (klappt einen Bereich auf).

export type FilterOptions = {
  sorts: Record<string, string>;
  defaultSort: string;
  genres: string[];
  decades: number[];
};

const Chevron = () => (
  <svg className="chev" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
);

export default function FilterBar({ sorts, defaultSort, genres, decades }: FilterOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);

  const sort = sp.get("sort") ?? defaultSort;
  const format = sp.get("format") ?? "alle";
  const decade = sp.get("jahrzehnt") ?? "";
  const genre = sp.get("genre") ?? "";
  const active = (format !== "alle" ? 1 : 0) + (decade ? 1 : 0) + (genre ? 1 : 0);

  function set(changes: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    p.delete("seite");
    for (const [k, v] of Object.entries(changes)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <>
      <div className="toolbar">
        <label className="pill">
          {sorts[sort] ?? sorts[defaultSort]}
          <Chevron />
          <select aria-label="Sortierung" value={sort} onChange={(e) => set({ sort: e.target.value === defaultSort ? null : e.target.value })}>
            {Object.entries(sorts).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <button className={`pill ${open ? "on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Filter {active > 0 && <span className="count">{active}</span>}
          <Chevron />
        </button>
        {active > 0 && (
          <button className="pill" style={{ background: "transparent", color: "var(--muted)" }}
            onClick={() => set({ format: null, jahrzehnt: null, genre: null })}>
            Zurücksetzen
          </button>
        )}
      </div>

      {open && (
        <div className="sheet">
          <div>
            <div className="label">Art</div>
            <div className="segmented" role="group">
              {[["alle", "Alle"], ["film", "Filme"], ["serie", "Serien"]].map(([k, label]) => (
                <button key={k} aria-pressed={format === k} onClick={() => set({ format: k === "alle" ? null : k })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Jahrzehnt</div>
            <div className="segmented" role="group">
              <button aria-pressed={!decade} onClick={() => set({ jahrzehnt: null })}>Alle</button>
              {decades.map((d) => (
                <button key={d} aria-pressed={decade === String(d)} onClick={() => set({ jahrzehnt: String(d) })}>
                  {d === 2020 ? "20er" : `${String(d).slice(2)}er`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Genre</div>
            <select className="select" value={genre} onChange={(e) => set({ genre: e.target.value || null })}>
              <option value="">Alle Genres</option>
              {genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
      )}
    </>
  );
}
