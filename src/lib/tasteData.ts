// Gemeinsames Laden der Daten für Vorschläge und Messtest.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetchAll";
import type { RatedTitle } from "./recommend";
import type { Title } from "./types";
import type { AiFeatures } from "./aiFeatures";

const COLS =
  "id,media_type,title,poster_path,release_year,format,genres,directors,cast_names,studios,collection_id,collection_name,oscars,globes,popularity,runtime_seconds,keywords,wd_genres,main_subjects,writers,cinematographers,composers,based_on,vote_average,vote_count";
// Ergänzung 12 (Wikidata) – fehlt sie noch, läuft alles mit den Grundspalten weiter
const COLS_EXTRA = COLS + ",black_and_white,budget_usd,nominations";

type Row = { status: string; rating: number | null; titles: Title | null };

async function load(supabase: SupabaseClient, userId: string, withCatalog: boolean, cols: string) {
  return Promise.all([
    fetchAll<Row>((from, to) =>
      supabase.from("user_title_feedback").select(`status,rating,titles(${cols})`).eq("user_id", userId).range(from, to),
    ),
    withCatalog
      ? fetchAll<Title>((from, to) => supabase.from("titles").select(cols).eq("media_type", "movie").range(from, to))
      : Promise.resolve([] as Title[]),
  ]);
}

export type AiByModel = Map<string, Map<number, AiFeatures>>;

// KI-Merkmale aller Filme, getrennt nach Modell (leer, solange Ergänzung 13 fehlt)
export async function loadAiFeatures(supabase: SupabaseClient): Promise<AiByModel> {
  const out: AiByModel = new Map();
  const rows = await fetchAll<{ title_id: number; model: string; features: AiFeatures }>((from, to) =>
    supabase.from("title_features").select("title_id,model,features").range(from, to),
  ).catch(() => []);
  for (const r of rows) {
    if (!out.has(r.model)) out.set(r.model, new Map());
    out.get(r.model)!.set(r.title_id, r.features);
  }
  return out;
}

export const withAi = <T extends Title>(titles: T[], ai: Map<number, AiFeatures> | undefined): T[] =>
  titles.map((t) => ({ ...t, ai: ai?.get(t.id) ?? null }));

export async function loadTasteData(supabase: SupabaseClient, userId: string, withCatalog = true) {
  const [mine, catalog] = await load(supabase, userId, withCatalog, COLS_EXTRA).catch(() =>
    load(supabase, userId, withCatalog, COLS),
  );
  let rated: RatedTitle[] = mine.filter((m) => m.titles).map((m) => ({ ...m.titles!, rating: m.rating, status: m.status }));
  let catalogOut = catalog;
  // KI-Merkmale nur nutzen, wenn mindestens die Hälfte des Katalogs eingeschätzt ist –
  // sonst würden Filme mit Einschätzung gegenüber Filmen ohne bevorzugt oder benachteiligt.
  if (withCatalog && catalog.length) {
    const ai = await loadAiFeatures(supabase);
    const best = [...ai.entries()].sort((a, b) => b[1].size - a[1].size)[0];
    if (best && best[1].size >= catalog.length / 2) {
      rated = withAi(rated, best[1]);
      catalogOut = withAi(catalog, best[1]);
    }
  }
  return { rated, catalog: catalogOut };
}
