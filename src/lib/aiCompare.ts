// Vergleich der KI-Modelle anhand deiner Bewertungen (Grundlage für den Reiter "KI").
import { evaluate, kindImpacts, tuneOptions, MIN_FOR_TEST } from "./evaluate";
import { AI_KINDS, KIND_NAMES, type FeatureKind, type RatedTitle } from "./recommend";
import { AI_MODELS, AI_SCALES, type AiFeatures, type AiModelKey, type AiScale } from "./aiFeatures";
import { withAi } from "./tasteData";

export type ModelResult = {
  key: string; // "ohne", "haiku", "haiku_ki" …
  name: string;
  short: string; // kurzer Spaltenname
  model?: AiModelKey;
  covered: number; // eingeschätzte Filme unter deinen bewerteten
  accuracy: number; // Treffsicherheit gesamt
  tasteOnly: number; // nur persönlicher Geschmack
  deltas: Map<FeatureKind, number>; // Beitrag je Merkmal
};

const lvl = (v: number) => (v <= 1 ? 0 : v === 2 ? 1 : 2);

export function compareModels(rated: RatedTitle[], ai: Map<string, Map<number, AiFeatures>>) {
  const count = rated.filter((r) => r.status === "gesehen" && r.rating).length;
  if (count < MIN_FOR_TEST) return null;
  const allKinds = Object.keys(KIND_NAMES) as FeatureKind[];

  const otherKinds = allKinds.filter((k) => !k.startsWith("ki_"));
  const run = (key: string, name: string, short: string, r: RatedTitle[], covered: number, onlyAi = false, model?: AiModelKey): ModelResult => {
    const extra = onlyAi ? { skipKinds: otherKinds } : {};
    const t = tuneOptions(r, extra);
    const probe = { ...t.opts, tasteWeight: t.opts.tasteWeight || 1 };
    const kinds = onlyAi ? allKinds.filter((k) => k.startsWith("ki_")) : allKinds;
    const deltas = new Map(kindImpacts(r, kinds, evaluate(r, probe), probe).map((x) => [x.kind, x.delta]));
    return { key, name, short, model, covered, accuracy: t.result!.accuracy, tasteOnly: evaluate(r, { ...probe, qualityWeight: 0 }).accuracy, deltas };
  };

  const results: ModelResult[] = [run("ohne", "Ohne KI", "Ohne", rated, 0)];
  for (const m of Object.keys(AI_MODELS) as AiModelKey[]) {
    const map = ai.get(m);
    const covered = map ? rated.filter((r) => r.rating && map.has(r.id)).length : 0;
    if (covered < MIN_FOR_TEST) continue;
    const short = AI_MODELS[m].name.replace(/ [\d.]+$/, "");
    results.push(run(m, `${AI_MODELS[m].name} · alle Merkmale`, short, withAi(rated, map), covered, false, m));
    results.push(run(`${m}_ki`, `${AI_MODELS[m].name} · Qualität + nur KI`, `${short} KI`, withAi(rated, map), covered, true, m));
  }

  // Wie oft sind sich Haiku und Sonnet einig? (gleiche Stufe wenig/mittel/viel)
  const h = ai.get("haiku"), s = ai.get("sonnet");
  const agreement = new Map<AiScale, number>();
  if (h && s) {
    const both = rated.filter((r) => h.has(r.id) && s.has(r.id));
    if (both.length >= 10) {
      for (const k of Object.keys(AI_SCALES) as AiScale[]) {
        agreement.set(k, both.filter((r) => lvl(h.get(r.id)![k]) === lvl(s.get(r.id)![k])).length / both.length);
      }
    }
  }
  const noise = count < 60 ? 0.01 : 0.005;
  return { count, noise, results, agreement, aiKinds: AI_KINDS, otherKinds };
}
