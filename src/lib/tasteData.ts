// Gemeinsames Laden der Daten für Vorschläge und Messtest.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetchAll";
import type { RatedTitle } from "./recommend";
import type { Title } from "./types";

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

export async function loadTasteData(supabase: SupabaseClient, userId: string, withCatalog = true) {
  const [mine, catalog] = await load(supabase, userId, withCatalog, COLS_EXTRA).catch(() =>
    load(supabase, userId, withCatalog, COLS),
  );
  const rated: RatedTitle[] = mine.filter((m) => m.titles).map((m) => ({ ...m.titles!, rating: m.rating, status: m.status }));
  return { rated, catalog };
}
