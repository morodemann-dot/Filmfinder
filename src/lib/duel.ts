import { AI_KINDS, buildProfile, DEFAULT_INTEREST, duelEntries, KIND_NAMES, recommend, type FeatureKind, type RatedTitle, type ScoreOptions } from "./recommend";
import { tuneOptions } from "./evaluate";
import { withAi } from "./tasteData";
import type { AiFeatures, AiModelKey } from "./aiFeatures";
import type { Title } from "./types";

// Varianten im Modell-Duell
export type SourceDef = { key: string; name: string; model?: AiModelKey; onlyAi?: boolean; interest?: number; quality?: number; extra?: ScoreOptions };

// Verbesserungen 1–6 (Nov. 2026) – jeweils zusätzlich zur aktuellen App-Einstellung (Interesse ×1, Qualität halb)
const APP = { interest: DEFAULT_INTEREST, quality: 0.5 };
const ALL_EXTRAS: ScoreOptions = { interestByRating: true, similarityWeight: 2, rareKeywords: true, originWeight: 0.4, genreQuality: true, genrePairWeight: 0.6 };

// "Nur KI-Merkmale": alle übrigen Merkmalsarten (Regie, Genres, Besetzung …) weglassen
export const NON_AI_KINDS = (Object.keys(KIND_NAMES) as FeatureKind[]).filter((k) => !(AI_KINDS as string[]).includes(k));

// Alle bekannten Varianten (auch frühere, damit alte Ergebnisse lesbar bleiben)
export const ALL_SOURCES: SourceDef[] = [
  { key: "ohne", name: "Bisher (v. a. Qualität)" },
  { key: "haiku", name: "Bisher + Haiku (alle)", model: "haiku" },
  { key: "haiku_ki", name: "Bisher + Haiku (nur KI)", model: "haiku", onlyAi: true },
  { key: "interesse", name: "Neu: Interesse", interest: DEFAULT_INTEREST },
  { key: "interesse_stark", name: "Neu: Interesse ×2", interest: DEFAULT_INTEREST * 2 },
  { key: "interesse_haiku_ki", name: "Neu: Interesse + Haiku (nur KI)", model: "haiku", onlyAi: true, interest: DEFAULT_INTEREST },
  { key: "interesse_haiku", name: "Neu: Interesse + Haiku (alle)", model: "haiku", interest: DEFAULT_INTEREST },
  // Feinabstimmung (nur im nachträglichen Test): Stärke des Interesses und Anteil der allgemeinen Qualität
  { key: "i15", name: "Interesse ×1,5", interest: DEFAULT_INTEREST * 1.5 },
  { key: "i3", name: "Interesse ×3", interest: DEFAULT_INTEREST * 3 },
  { key: "i2_q05", name: "Interesse ×2 · Qualität halb", interest: DEFAULT_INTEREST * 2, quality: 0.5 },
  { key: "i2_q0", name: "Interesse ×2 · ohne Qualität", interest: DEFAULT_INTEREST * 2, quality: 0 },
  { key: "i1_q05", name: "Alte App: Interesse · Qualität halb", interest: DEFAULT_INTEREST, quality: 0.5 },
  { key: "v1", name: "+ 1 Interesse nach Bewertung", ...APP, extra: { interestByRating: true } },
  { key: "v2", name: "+ 2 Ähnlichkeit zu Lieblingen", ...APP, extra: { similarityWeight: 2 } },
  { key: "v2s", name: "+ 2 Ähnlichkeit (stark)", ...APP, extra: { similarityWeight: 5 } },
  { key: "v3", name: "+ 3 seltene Stichworte", ...APP, extra: { rareKeywords: true } },
  { key: "v4", name: "+ 4 Herkunft, Sprache, Studio", ...APP, extra: { originWeight: 0.4 } },
  { key: "v5", name: "+ 5 Qualität je Genre", ...APP, extra: { genreQuality: true } },
  { key: "v6", name: "+ 6 Genre-Kombinationen", ...APP, extra: { genrePairWeight: 0.6 } },
  { key: "vall", name: "App mit Verbesserungen 1–6", ...APP, extra: ALL_EXTRAS },
  { key: "vall_nosim", name: "Alle Verbesserungen ohne Ähnlichkeit", ...APP, extra: { ...ALL_EXTRAS, similarityWeight: 0 } },
  { key: "vall_q0", name: "Alle Verbesserungen ohne Qualität", ...APP, quality: 0, extra: ALL_EXTRAS },
  // 7) Duell-Antworten als Lernstoff (fair getestet: gelernt wird nur aus den jeweils anderen Antworten)
  { key: "d05", name: "+ 7 Duell-Antworten (leicht)", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 0.5 } },
  { key: "d1", name: "+ 7 Duell-Antworten", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 1 } },
  { key: "d2", name: "+ 7 Duell-Antworten (stark)", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 2 } },
  { key: "d4", name: "Vorherige App: + Duell-Antworten", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4 } },
  { key: "d8", name: "+ 7 Duell-Antworten (extrem)", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 8 } },
  // 8) Merkliste / Kein Interesse stärker (hilft allen, die kein Duell machen)
  { key: "sw2", name: "+ 8 Merkliste/Kein Interesse ×2", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, swipeWeight: 2 } },
  { key: "sw4", name: "+ 8 Merkliste/Kein Interesse ×4", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, swipeWeight: 4 } },
  // 9) TMDB-Empfehlungen ("Wer X mochte, mochte auch Y") – zusätzlich zur neuesten App
  { key: "r1", name: "+ 9 TMDB-Empfehlungen (leicht)", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, recWeight: 0.15 } },
  { key: "r2", name: "+ 9 TMDB-Empfehlungen", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, recWeight: 0.3 } },
  { key: "r3", name: "+ 9 TMDB-Empfehlungen (stark)", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, recWeight: 0.6 } },
  // Kombination, wie sie jetzt im Filmfinder läuft: Duell-Antworten + Merkliste/Kein Interesse ×2 + TMDB leicht
  { key: "kombi", name: "Neueste App: + Merkliste ×2 + TMDB", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, swipeWeight: 2, recWeight: 0.15 } },
  // 10) Schlechte Bewertungen / Kein Interesse / passt nicht stärker
  { key: "n15", name: "+ 10 Negatives ×1,5", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, swipeWeight: 2, recWeight: 0.15, negWeight: 1.5 } },
  { key: "n2", name: "+ 10 Negatives ×2", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, swipeWeight: 2, recWeight: 0.15, negWeight: 2 } },
  { key: "n07", name: "+ 10 Negatives schwächer (×0,7)", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, swipeWeight: 2, recWeight: 0.15, negWeight: 0.7 } },
  { key: "n05", name: "+ 10 Negatives schwächer (×0,5)", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, swipeWeight: 2, recWeight: 0.15, negWeight: 0.5 } },
  { key: "n3", name: "+ 10 Negatives ×3", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, swipeWeight: 2, recWeight: 0.15, negWeight: 3 } },
  { key: "r4", name: "+ 9 TMDB-Empfehlungen (sehr stark)", ...APP, extra: { ...ALL_EXTRAS, duelWeight: 4, recWeight: 1.2 } },
];
const byKey = (k: string) => ALL_SOURCES.find((s) => s.key === k)!;

// Wer tritt in neuen Runden gegeneinander an?
// Runde 1–5: ohne / Haiku / Haiku nur KI (alle 38 %). Rücktest: Interesse ~75 %, KI bringt nichts dazu.
// Runde 6–?: Interesse ×1 / ×2 / +Haiku → Haiku klar schwächer (55 %).
// Jetzt: App-Einstellung vs. Interesse ×2 vs. ganz ohne Qualität
// Runde 1–5: ohne / Haiku / Haiku nur KI (alle 38 %). Rücktest: Interesse ~75 %, KI bringt nichts dazu.
// Danach: App vs. Interesse ×2 vs. ohne Qualität; dann App vs. alle Verbesserungen vs. Ähnlichkeit (5 Runden).
// Jetzt (aus dem ganzen Katalog): neue App (alle 1–6) vs. alte App vs. alle ohne Ähnlichkeit
// Ab Nov. 2026 (Runde mit Duell-Lernen): App mit Duell-Antworten vs. vorherige App vs. alte App
// 5 Runden (je 50 Karten): Neueste 73 %, ×0,7 66 %, Vorherige 64 % → ×0,7 nicht übernommen
// Ab 7. Nov. spät: 1–6 lag live klar hinten (50 %) → ersetzt durch "Negatives schwächer ×0,7" (nachträglich gleichauf, 79 %)
export const DUEL_SOURCES: SourceDef[] = [byKey("kombi"), byKey("d4"), byKey("n07")];
// Was wird im nachträglichen Test auf deinen Antworten verglichen?
// Nov. 2026: Negatives stärker schadet (×1,5 78 %, ×2 75 %, ×3 68 % gegenüber 79 %) → jetzt: schwächer?
export const EVAL_SOURCES: SourceDef[] = ["ohne", "i1_q05", "vall", "d4", "kombi", "n15", "n07", "n05"].map(byKey);
export const DUEL_MODELS = [...new Set(DUEL_SOURCES.flatMap((s) => (s.model ? [s.model] : [])))];
export const sourceName = (k: string) => ALL_SOURCES.find((s) => s.key === k)?.name ?? k;

// Feinabstimmung ist aufwendig und hängt nur von den Bewertungen ab → einmal rechnen, mehrfach nutzen
const tuneCache = new WeakMap<RatedTitle[], Map<string, ReturnType<typeof tuneOptions>>>();
function tunedFor(r: RatedTitle[], onlyAi: boolean) {
  let m = tuneCache.get(r);
  if (!m) { m = new Map(); tuneCache.set(r, m); }
  const key = onlyAi ? "ai" : "all";
  if (!m.has(key)) m.set(key, tuneOptions(r, onlyAi ? { skipKinds: NON_AI_KINDS } : {}));
  return m.get(key)!;
}

// Bewertet Kandidaten so, wie es die Variante tun würde
export function rankWith(src: SourceDef, rated: RatedTitle[], catalog: Title[], ai: Map<string, Map<number, AiFeatures>>, cands: Title[], duel: RatedTitle[] = []) {
  const map = src.model ? ai.get(src.model) : undefined;
  const r = map ? withAi(rated, map) : rated;
  const c = map ? withAi(cands, map) : cands;
  const cat = map ? withAi(catalog, map) : catalog;
  const { opts } = tunedFor(r, !!src.onlyAi);
  const o: ScoreOptions = { ...opts, interestWeight: src.interest ?? 0, qualityWeight: src.quality ?? opts.qualityWeight, ...src.extra };
  const learn = o.duelWeight && duel.length ? [...r, ...duel] : r;
  return recommend(c, buildProfile(learn, o, src.interest || src.extra ? cat : undefined), o);
}

// Nachträglicher Test: Wie oft stuft die Variante einen Film, der dir gepasst hat,
// höher ein als einen, der nicht gepasst hat? 50 % = Raten.
export function duelAuc(ranked: { title: Title; score: number }[], answers: Map<number, boolean>) {
  const yes = ranked.filter((r) => answers.get(r.title.id) === true).map((r) => r.score);
  const no = ranked.filter((r) => answers.get(r.title.id) === false).map((r) => r.score);
  let right = 0;
  for (const a of yes) for (const b of no) right += a > b ? 1 : a === b ? 0.5 : 0;
  return { auc: yes.length && no.length ? right / (yes.length * no.length) : null, yes: yes.length, no: no.length };
}

// Fairer Test für Varianten, die aus Duell-Antworten lernen: Die Antworten werden in 5 Gruppen geteilt.
// Für jede Gruppe lernt die Variante aus den anderen 4 Gruppen und muss diese Gruppe vorhersagen.
// Verglichen werden nur Paare innerhalb derselben Gruppe – so wird keine Antwort "abgeschrieben".
// Varianten ohne Duell-Lernen werden genauso gezählt (gleiche Paare), damit der Vergleich fair ist.
const FOLDS = 5;
const foldOf = (id: number) => ((id * 2654435761) >>> 0) % FOLDS;
export function duelAucCV(src: SourceDef, rated: RatedTitle[], catalog: Title[], ai: Map<string, Map<number, AiFeatures>>, films: Title[], answers: Map<number, boolean>) {
  const learns = !!src.extra?.duelWeight;
  const byId = new Map(films.map((t) => [t.id, t]));
  const once = learns ? null : new Map(rankWith(src, rated, catalog, ai, films).map((r) => [r.title.id, r.score]));
  let right = 0, pairs = 0, yesN = 0, noN = 0;
  for (let k = 0; k < FOLDS; k++) {
    const test = films.filter((t) => foldOf(t.id) === k && answers.has(t.id));
    if (!test.length) continue;
    let score = once;
    if (learns) {
      const train = new Map([...answers].filter(([id]) => foldOf(id) !== k));
      score = new Map(rankWith(src, rated, catalog, ai, test, duelEntries(train, byId)).map((r) => [r.title.id, r.score]));
    }
    const yes = test.filter((t) => answers.get(t.id) === true).map((t) => score!.get(t.id) ?? -99);
    const no = test.filter((t) => answers.get(t.id) === false).map((t) => score!.get(t.id) ?? -99);
    yesN += yes.length; noN += no.length;
    for (const a of yes) for (const b of no) { right += a > b ? 1 : a === b ? 0.5 : 0; pairs++; }
  }
  return { auc: pairs ? right / pairs : null, yes: yesN, no: noN };
}
