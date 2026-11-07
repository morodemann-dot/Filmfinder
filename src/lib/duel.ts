import { AI_KINDS, buildProfile, DEFAULT_INTEREST, KIND_NAMES, recommend, type FeatureKind, type RatedTitle } from "./recommend";
import { tuneOptions } from "./evaluate";
import { withAi } from "./tasteData";
import type { AiFeatures, AiModelKey } from "./aiFeatures";
import type { Title } from "./types";

// Varianten im Modell-Duell
export type SourceDef = { key: string; name: string; model?: AiModelKey; onlyAi?: boolean; interest?: number };

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
];
const byKey = (k: string) => ALL_SOURCES.find((s) => s.key === k)!;

// Wer tritt in neuen Runden gegeneinander an?
// Runde 1–5: ohne / Haiku / Haiku nur KI (alle 38 %). Rücktest: Interesse ~75 %, KI bringt nichts dazu.
// Jetzt: Interesse normal vs. ×2 vs. mit Haiku (alle Merkmale)
export const DUEL_SOURCES: SourceDef[] = [byKey("interesse"), byKey("interesse_stark"), byKey("interesse_haiku")];
// Was wird im nachträglichen Test auf deinen Antworten verglichen?
export const EVAL_SOURCES: SourceDef[] = ["ohne", "haiku_ki", "interesse", "interesse_stark", "interesse_haiku_ki", "interesse_haiku"].map(byKey);
export const DUEL_MODELS = [...new Set(DUEL_SOURCES.flatMap((s) => (s.model ? [s.model] : [])))];
export const sourceName = (k: string) => ALL_SOURCES.find((s) => s.key === k)?.name ?? k;

// Bewertet Kandidaten so, wie es die Variante tun würde
export function rankWith(src: SourceDef, rated: RatedTitle[], catalog: Title[], ai: Map<string, Map<number, AiFeatures>>, cands: Title[]) {
  const map = src.model ? ai.get(src.model) : undefined;
  const r = map ? withAi(rated, map) : rated;
  const c = map ? withAi(cands, map) : cands;
  const cat = map ? withAi(catalog, map) : catalog;
  const { opts } = tuneOptions(r, src.onlyAi ? { skipKinds: NON_AI_KINDS } : {});
  const o = { ...opts, interestWeight: src.interest ?? 0 };
  return recommend(c, buildProfile(r, o, src.interest ? cat : undefined), o);
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
