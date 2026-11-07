import { AI_KINDS, KIND_NAMES, type FeatureKind } from "./recommend";
import type { AiModelKey } from "./aiFeatures";

// Quellen im Modell-Duell. Sonnet ist vorerst nicht dabei (zu teuer für den Nutzen im Messtest);
// zum Wieder-Aufnehmen einfach unten eintragen.
export type DuelSource = "ohne" | "haiku" | "haiku_ki" | "sonnet" | "sonnet_ki";
export type SourceDef = { key: DuelSource; name: string; model?: AiModelKey; onlyAi?: boolean };

export const DUEL_SOURCES: SourceDef[] = [
  { key: "ohne", name: "Ohne KI (aktuelle App)" },
  { key: "haiku", name: "Haiku · alle Merkmale", model: "haiku" },
  { key: "haiku_ki", name: "Haiku · Qualität + nur KI", model: "haiku", onlyAi: true },
];
export const DUEL_MODELS = [...new Set(DUEL_SOURCES.flatMap((s) => (s.model ? [s.model] : [])))];

export const SOURCE_NAMES: Record<DuelSource, string> = {
  ohne: "Ohne KI (aktuelle App)",
  haiku: "Haiku · alle Merkmale",
  haiku_ki: "Haiku · Qualität + nur KI",
  sonnet: "Sonnet · alle Merkmale",
  sonnet_ki: "Sonnet · Qualität + nur KI",
};

// "Nur KI-Merkmale": alle übrigen Merkmalsarten (Regie, Genres, Besetzung …) weglassen
export const NON_AI_KINDS = (Object.keys(KIND_NAMES) as FeatureKind[]).filter((k) => !(AI_KINDS as string[]).includes(k));
