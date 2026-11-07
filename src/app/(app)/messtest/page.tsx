import { createClient, getUser } from "@/lib/supabase/server";
import { loadAiFeatures, loadTasteData, withAi } from "@/lib/tasteData";
import { AI_MODELS, type AiModelKey } from "@/lib/aiFeatures";
import { MIN_FOR_TEST } from "@/lib/evaluate";
import MesstestView from "./MesstestView";

// Messtest: Wie treffsicher sind die Vorschläge – und welche Merkmale helfen wirklich?
export default async function MesstestPage() {
  const supabase = await createClient();
  const user = await getUser();
  const [{ rated }, ai] = await Promise.all([loadTasteData(supabase, user!.id, false), loadAiFeatures(supabase)]);
  // Für jedes Modell, das genug deiner Filme eingeschätzt hat, eine Variante mit KI-Merkmalen
  const variants = (Object.keys(AI_MODELS) as AiModelKey[]).flatMap((m) => {
    const map = ai.get(m);
    const covered = map ? rated.filter((r) => r.rating && map.has(r.id)).length : 0;
    return covered >= MIN_FOR_TEST ? [{ name: AI_MODELS[m].name, covered, rated: withAi(rated, map) }] : [];
  });
  return <MesstestView rated={rated} variants={variants} />;
}
