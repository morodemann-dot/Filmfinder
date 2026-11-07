// Messtest: Wie gut sagt die App deine Bewertungen voraus?
//
// So funktioniert es (einfach erklärt):
// 1. Deine bewerteten Filme werden in 5 Gruppen geteilt.
// 2. Eine Gruppe wird "versteckt". Aus den übrigen lernt die App deinen Geschmack.
// 3. Für die versteckten Filme sagt sie voraus, welcher dir besser gefällt.
// 4. Wir vergleichen mit deinen echten Punkten – bei jedem Filmpaar: richtig oder falsch?
// 5. Das Ganze 5-mal, bis jede Gruppe einmal versteckt war.
// 50 % = Raten. Je höher, desto treffsicherer.

import { buildProfile, DEFAULT_OPTIONS, recommend, type FeatureKind, type RatedTitle, type ScoreOptions } from "./recommend";

export const MIN_FOR_TEST = 20;
const FOLDS = 5;

export type EvalResult = { accuracy: number; pairs: number };

// Gleiche Gruppen bei jedem Aufruf (sonst schwankt das Ergebnis zufällig)
const fold = (id: number) => ((id * 2654435761) >>> 0) % FOLDS;

export function evaluate(rated: RatedTitle[], opts: ScoreOptions = {}): EvalResult {
  const isRated = (r: RatedTitle) => r.status === "gesehen" && !!r.rating;
  let right = 0, pairs = 0;
  for (let f = 0; f < FOLDS; f++) {
    const hidden = rated.filter((r) => isRated(r) && fold(r.id) === f);
    if (hidden.length < 2) continue;
    const train = rated.filter((r) => !(isRated(r) && fold(r.id) === f));
    const profile = buildProfile(train, opts);
    const score = new Map(recommend(hidden, profile, opts).map((x) => [x.title.id, x.score]));
    for (let i = 0; i < hidden.length; i++) {
      for (let j = i + 1; j < hidden.length; j++) {
        const a = hidden[i], b = hidden[j];
        if (a.rating === b.rating) continue; // gleich bewertet: kein Vergleich möglich
        const d = (score.get(a.id) ?? 0) - (score.get(b.id) ?? 0);
        pairs++;
        if (d === 0) right += 0.5;
        else if (Math.sign(d) === Math.sign(a.rating! - b.rating!)) right += 1;
      }
    }
  }
  return { accuracy: pairs ? right / pairs : 0.5, pairs };
}

export type KindImpact = { kind: FeatureKind; delta: number };

// Wie viel bringt jede Merkmalsart? (Treffsicherheit mit – ohne)
export function kindImpacts(rated: RatedTitle[], kinds: FeatureKind[], base: EvalResult, opts: ScoreOptions = {}): KindImpact[] {
  return kinds
    .map((kind) => ({ kind, delta: base.accuracy - evaluate(rated, { ...opts, skipKinds: [kind] }).accuracy }))
    .sort((a, b) => b.delta - a.delta);
}

// Persönliche Einstellung: probiert einige Mischungen aus und nimmt die treffsicherste.
// Bei Gleichstand gewinnt die vorsichtigere (weniger Geschmack, mehr Vorsicht).
const TASTE_STEPS = [0, 0.5, 1, 1.5, 2.5];
const SHRINK_STEPS = [2, 6];
// Zwischenspeicher: Das Abstimmen dauert ~0,5 s und ändert sich nur, wenn sich deine Einträge ändern
const tuneCache = new Map<string, ReturnType<typeof tuneUncached>>();
function signature(rated: RatedTitle[], extra: Pick<ScoreOptions, "skipKinds">) {
  let h = 2166136261; // FNV-1a über alles, was das Ergebnis beeinflusst
  const add = (x: string) => { for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } };
  for (const r of rated) add(`${r.id}|${r.status}|${r.rating ?? ""}|${r.favorite ? 1 : 0}|${r.reason ?? ""}|${(r.aspects ?? []).join(",")};`);
  add(JSON.stringify(extra.skipKinds ?? []));
  return `${rated.length}:${h >>> 0}`;
}
export function tuneOptions(rated: RatedTitle[], extra: Pick<ScoreOptions, "skipKinds"> = {}) {
  const key = signature(rated, extra);
  const hit = tuneCache.get(key);
  if (hit) return hit;
  const res = tuneUncached(rated, extra);
  if (tuneCache.size > 200) tuneCache.delete(tuneCache.keys().next().value!);
  tuneCache.set(key, res);
  return res;
}
function tuneUncached(rated: RatedTitle[], extra: Pick<ScoreOptions, "skipKinds"> = {}) {
  const count = rated.filter((r) => r.status === "gesehen" && r.rating).length;
  if (count < MIN_FOR_TEST) return { opts: { ...DEFAULT_OPTIONS, ...extra } as ScoreOptions, result: null };
  let best: { opts: ScoreOptions; result: EvalResult } = { opts: { ...DEFAULT_OPTIONS, ...extra }, result: evaluate(rated, { ...DEFAULT_OPTIONS, ...extra }) };
  for (const tasteWeight of TASTE_STEPS) {
    for (const shrink of SHRINK_STEPS) {
      const opts: ScoreOptions = { qualityWeight: 1, tasteWeight, shrink, ...extra };
      const result = evaluate(rated, opts);
      if (result.accuracy > best.result.accuracy + 0.002) best = { opts, result };
    }
  }
  return best;
}
