// "Weil du X mochtest": Filme, die einem bestimmten Film ähneln.
import { featuresOf, type FeatureKind } from "./recommend";
import type { Title } from "./types";

// Wie stark ein gemeinsames Merkmal für Ähnlichkeit zählt
const SIM_WEIGHT: Partial<Record<FeatureKind, number>> = {
  genre: 0.5, subgenre: 1, thema: 0.8, regie: 1.2, drehbuch: 0.8, vorlage: 0.3, reihe: 1.5, besetzung: 0.4,
  jahrzehnt: 0.2, kamera: 0.3, musik: 0.3,
};
const w = (k: FeatureKind) => SIM_WEIGHT[k] ?? (k.startsWith("ki_") ? 0.3 : 0);

function vector(t: Title) {
  const m = new Map<string, number>();
  for (const f of featuresOf(t)) { const x = w(f.kind); if (x) m.set(f.key, x); }
  return m;
}

// Ähnlichkeit 0–1 (gewichtete Überschneidung der Merkmale)
export function similarity(a: Map<string, number>, b: Map<string, number>) {
  let shared = 0, sa = 0, sb = 0;
  for (const [k, x] of a) { sa += x; if (b.has(k)) shared += x; }
  for (const x of b.values()) sb += x;
  return sa && sb ? shared / Math.sqrt(sa * sb) : 0;
}

// Die n ähnlichsten Kandidaten; "boost" = persönlicher Vorschlagswert (macht passende Filme etwas wahrscheinlicher)
export function moreLike(anchor: Title, candidates: Title[], boost: Map<number, number>, n = 10) {
  const av = vector(anchor);
  return candidates
    .filter((t) => t.id !== anchor.id)
    .map((t) => ({ t, s: similarity(av, vector(t)) + 0.08 * (boost.get(t.id) ?? 0) }))
    .filter((x) => x.s > 0.15)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.t);
}

// Zählt die Tage seit 1970 – damit die "Weil du X mochtest"-Reihen täglich wechseln
export function dayNumber() {
  return Math.floor(Date.now() / 86_400_000);
}
