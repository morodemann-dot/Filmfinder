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
