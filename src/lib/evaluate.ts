// Messtest: Wie gut sagt die App deine Bewertungen voraus?
//
// So funktioniert es (einfach erklärt):
// 1. Deine bewerteten Filme werden in 5 Gruppen geteilt.
// 2. Eine Gruppe wird "versteckt". Aus den übrigen lernt die App deinen Geschmack.
// 3. Für die versteckten Filme sagt sie voraus, welcher dir besser gefällt.
// 4. Wir vergleichen mit deinen echten Punkten – bei jedem Filmpaar: richtig oder falsch?
// 5. Das Ganze 5-mal, bis jede Gruppe einmal versteckt war.
// 50 % = Raten. Je höher, desto treffsicherer.

import { buildProfile, recommend, type FeatureKind, type RatedTitle, type ScoreOptions } from "./recommend";

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
    const { prefs } = buildProfile(train);
    const score = new Map(recommend(hidden, prefs, opts).map((x) => [x.title.id, x.score]));
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
export function kindImpacts(rated: RatedTitle[], kinds: FeatureKind[], base: EvalResult): KindImpact[] {
  return kinds
    .map((kind) => ({ kind, delta: base.accuracy - evaluate(rated, { skipKinds: [kind] }).accuracy }))
    .sort((a, b) => b.delta - a.delta);
}
