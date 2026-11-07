// Gemeinsames Laden der Daten für Vorschläge und Messtest.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll, fetchAllParallel } from "./fetchAll";
import type { RatedTitle } from "./recommend";
import type { Title } from "./types";
import type { AiFeatures } from "./aiFeatures";

const COLS =
  "id,media_type,title,poster_path,release_year,format,genres,directors,cast_names,studios,collection_id,collection_name,oscars,globes,popularity,runtime_seconds,keywords,wd_genres,main_subjects,writers,cinematographers,composers,based_on,vote_average,vote_count,certification_de,festivals,set_in_period,narrative_locations,countries,original_language";
// Ergänzung 12 (Wikidata) – fehlt sie noch, läuft alles mit den Grundspalten weiter
const COLS_EXTRA = COLS + ",black_and_white,budget_usd,nominations";

type Row = { status: string; rating: number | null; reason?: string | null; aspects?: string[]; favorite?: boolean; titles: Title | null };

// Zwischenspeicher für den Katalog: Er ist für alle Nutzer gleich und ändert sich selten.
// So wird er nicht bei jedem Seitenaufruf komplett neu geladen (wichtig bei Tausenden Filmen).
const CATALOG_TTL = 10 * 60 * 1000; // 10 Minuten
const catalogCache = new Map<string, { at: number; data: Title[] }>();
export function invalidateCatalogCache() { catalogCache.clear(); }

async function loadCatalog(supabase: SupabaseClient, cols: string): Promise<Title[]> {
  const hit = catalogCache.get(cols);
  if (hit && Date.now() - hit.at < CATALOG_TTL) return hit.data;
  const { count, error } = await supabase.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "movie");
  if (error) throw new Error(error.message);
  const data = await fetchAllParallel<Title>(
    (from, to) => supabase.from("titles").select(cols).eq("media_type", "movie").order("id").range(from, to),
    count ?? 0,
  );
  catalogCache.set(cols, { at: Date.now(), data });
  return data;
}

async function load(supabase: SupabaseClient, userId: string, withCatalog: boolean, cols: string) {
  if (!withCatalog) {
    return Promise.all([
      fetchAll<Row>((from, to) =>
        supabase.from("user_title_feedback").select(`status,rating,reason,aspects,favorite,titles(${cols})`).eq("user_id", userId).range(from, to),
      ).catch(() => fetchAll<Row>((from, to) =>
        supabase.from("user_title_feedback").select(`status,rating,reason,aspects,titles(${cols})`).eq("user_id", userId).range(from, to),
      )).catch(() => fetchAll<Row>((from, to) =>
        supabase.from("user_title_feedback").select(`status,rating,titles(${cols})`).eq("user_id", userId).range(from, to),
      )),
      Promise.resolve([] as Title[]),
    ]);
  }
  // Mit Katalog: deine Einträge nur als IDs laden und mit dem (zwischengespeicherten) Katalog verbinden
  const [fb, catalog] = await Promise.all([
    fetchAll<{ title_id: number; status: string; rating: number | null; reason?: string | null; aspects?: string[]; favorite?: boolean }>((from, to) =>
      supabase.from("user_title_feedback").select("title_id,status,rating,reason,aspects,favorite").eq("user_id", userId).range(from, to),
    ).catch(() => fetchAll<{ title_id: number; status: string; rating: number | null; reason?: string | null; aspects?: string[] }>((from, to) =>
      supabase.from("user_title_feedback").select("title_id,status,rating,reason,aspects").eq("user_id", userId).range(from, to),
    )).catch(() => fetchAll<{ title_id: number; status: string; rating: number | null }>((from, to) =>
      supabase.from("user_title_feedback").select("title_id,status,rating").eq("user_id", userId).range(from, to),
    )),
    loadCatalog(supabase, cols),
  ]);
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const missing = fb.filter((f) => !byId.has(f.title_id)).map((f) => f.title_id); // z. B. Serien
  if (missing.length) {
    const { data } = await supabase.from("titles").select(cols).in("id", missing.slice(0, 1000));
    for (const t of (data ?? []) as unknown as Title[]) byId.set(t.id, t);
  }
  const rows: Row[] = fb.map((f) => ({ ...f, titles: byId.get(f.title_id) ?? null }));
  return [rows, catalog] as const;
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
  let rated: RatedTitle[] = mine.filter((m) => m.titles).map((m) => ({
    ...m.titles!, rating: m.rating, status: m.status, reason: m.reason ?? null, aspects: m.aspects ?? [], favorite: !!m.favorite,
  }));
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

// Filme, die du gerade pausiert hast ("Heute nicht" / "Vielleicht später")
export async function loadSnoozed(supabase: SupabaseClient, userId: string): Promise<Set<number>> {
  const { data, error } = await supabase.from("snoozed").select("title_id").eq("user_id", userId).gt("until", new Date().toISOString());
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.title_id as number));
}
