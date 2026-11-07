import { AI_MODELS, type AiModelKey } from "./aiFeatures";

// Quellen im Modell-Duell
export type DuelSource = "ohne" | AiModelKey;
export const SOURCE_NAMES: Record<DuelSource, string> = {
  ohne: "Ohne KI (aktuelle App)",
  haiku: AI_MODELS.haiku.name,
  sonnet: AI_MODELS.sonnet.name,
};
