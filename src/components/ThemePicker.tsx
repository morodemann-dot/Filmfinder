"use client";

import { useSyncExternalStore } from "react";

// Hell / Dunkel / Automatisch (wie das iPhone). Wird nur auf diesem Gerät gespeichert.
type Choice = "auto" | "light" | "dark";
const KEY = "ff-theme";
const listeners = new Set<() => void>();

function read(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch { return "auto"; }
}

export function applyTheme(choice: Choice) {
  const light = choice === "light" || (choice === "auto" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f2f2f7" : "#000000");
}

// Was gerade wirklich angezeigt wird (hell oder dunkel) – steht als data-theme am <html>
function shown(): "light" | "dark" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function subscribeShown(cb: () => void) {
  listeners.add(cb);
  const m = window.matchMedia("(prefers-color-scheme: light)");
  const onSys = () => setTimeout(cb, 0); // das Skript im Seitenkopf stellt zuerst um
  m.addEventListener("change", onSys);
  return () => { listeners.delete(cb); m.removeEventListener("change", onSys); };
}

// Knopf oben rechts: Sonne (hell) ⇄ Mond (dunkel), mit Animation
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribeShown, shown, () => "dark" as const);
  const next = mode === "light" ? "dark" : "light";
  return (
    <button className={`theme-toggle ${mode}`} onClick={() => {
      try { localStorage.setItem(KEY, next); } catch { /* egal */ }
      applyTheme(next);
      listeners.forEach((l) => l());
    }} aria-label={next === "light" ? "Hellen Modus einschalten" : "Dunklen Modus einschalten"} title={next === "light" ? "Hell" : "Dunkel"}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <mask id="tt-cut">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <circle className="tt-cut" cx="17" cy="7" r="7" fill="#000" />
        </mask>
        <circle className="tt-core" cx="12" cy="12" r="9" fill="currentColor" mask="url(#tt-cut)" />
        <g className="tt-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="1.5" x2="12" y2="3.5" /><line x1="12" y1="20.5" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="3.5" y2="12" /><line x1="20.5" y1="12" x2="22.5" y2="12" />
          <line x1="4.6" y1="4.6" x2="6" y2="6" /><line x1="18" y1="18" x2="19.4" y2="19.4" />
          <line x1="4.6" y1="19.4" x2="6" y2="18" /><line x1="18" y1="6" x2="19.4" y2="4.6" />
        </g>
      </svg>
    </button>
  );
}

export default function ThemePicker() {
  const choice = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => "auto" as Choice,
  );
  function pick(c: Choice) {
    try { localStorage.setItem(KEY, c); } catch { /* privater Modus – gilt dann nur bis zum Neuladen */ }
    applyTheme(c);
    listeners.forEach((l) => l());
  }
  const opts: [Choice, string][] = [["auto", "Automatisch"], ["light", "☀︎ Hell"], ["dark", "☾ Dunkel"]];
  return (
    <div className="theme-pick" role="group" aria-label="Darstellung">
      {opts.map(([c, label]) => (
        <button key={c} aria-pressed={choice === c} onClick={() => pick(c)}>{label}</button>
      ))}
    </div>
  );
}
