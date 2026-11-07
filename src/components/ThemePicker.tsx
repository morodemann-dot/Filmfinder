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
