// "Weil du X mochtest": Filme, die einem bestimmten Film ähneln.
import { similarity, simVector } from "./recommend";
import type { Title } from "./types";

export { similarity };

// Die n ähnlichsten Kandidaten; "boost" = persönlicher Vorschlagswert (macht passende Filme etwas wahrscheinlicher)
export function moreLike(anchor: Title, candidates: Title[], boost: Map<number, number>, n = 10) {
  const av = simVector(anchor);
  return candidates
    .filter((t) => t.id !== anchor.id)
    .map((t) => ({ t, s: similarity(av, simVector(t)) + 0.08 * (boost.get(t.id) ?? 0) }))
    .filter((x) => x.s > 0.15)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.t);
}

// Zählt die Tage seit 1970 – damit die "Weil du X mochtest"-Reihen täglich wechseln
export function dayNumber() {
  return Math.floor(Date.now() / 86_400_000);
}

// Zeitfenster (z. B. alle 4 Stunden ein neues) – für wechselnde Start-Vorschläge
export function timeSlot(hours: number) {
  return Math.floor(Date.now() / (hours * 3_600_000));
}

// Wer die App nach ein paar Stunden wieder öffnet, soll nicht immer denselben Film zuerst sehen:
// pro Zeitfenster rückt ein anderer der besten Vorschläge nach vorne. Die übrigen behalten ihre Reihenfolge.
export function rotateLead<T>(items: T[], slot: number, seed: string, top = 10): T[] {
  const n = Math.min(top, items.length);
  if (n < 2) return items;
  let h = 2166136261;
  for (const c of seed + ":" + slot) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const lead = (h >>> 0) % n;
  // Rotation der Spitze: ab dem gewählten Film weiter, die übersprungenen hängen hinten an die Spitze an
  return [...items.slice(lead, n), ...items.slice(0, lead), ...items.slice(n)];
}
