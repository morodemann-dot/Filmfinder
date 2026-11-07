"use server";

// Einstiegs-Tutorial: Lieblingsfilme suchen und begründen, danach ein Geschmacks-Check.
import { createAdminClient, createClient, getUser } from "@/lib/supabase/server";
import { fetchTitleRow, searchTmdb } from "@/lib/tmdb";
import type { AspectInfo } from "@/lib/aspects";

export type FavHit = { tmdb_id: number; id: number | null; title: string; year: string | null; poster_path: string | null };
export type FavItem = { id: number; title: string; year: number | null; poster_path: string | null; rating: number | null; hasReasons: boolean };

const INFO_COLS = "id,title,poster_path,release_year,directors,cast_names,writers,genres,wd_genres,composers,cinematographers,based_on,keywords,main_subjects,set_in_period,narrative_locations,runtime_seconds,certification_de,collection_name";

async function me() {
  const user = await getUser();
  if (!user) throw new Error("Bitte erst anmelden.");
  return user;
}

// Muss das Tutorial noch gezeigt werden? (Fehlt Ergänzung 18 → nein, damit nichts blockiert)
export async function onboardingNeeded(): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("onboarding_done_at").eq("user_id", user.id).maybeSingle();
  if (error) return false;
  return !data?.onboarding_done_at;
}

export async function finishOnboarding() {
  const user = await me();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles")
    .upsert({ user_id: user.id, onboarding_done_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error("Speichern fehlgeschlagen (wurde die Ergänzung 18 ausgeführt?)");
}

// Schon markierte Lieblingsfilme (falls jemand das Tutorial neu beginnt oder schon ♥ gesetzt hat)
export async function myFavorites(): Promise<FavItem[]> {
  const user = await me();
  const supabase = await createClient();
  const { data } = await supabase.from("user_title_feedback")
    .select("title_id,rating,aspects,titles(title,release_year,poster_path)")
    .eq("user_id", user.id).eq("favorite", true).limit(30);
  type Row = { title_id: number; rating: number | null; aspects: string[] | null; titles: { title: string; release_year: number | null; poster_path: string | null } | null };
  return ((data ?? []) as unknown as Row[]).filter((r) => r.titles).map((r) => ({
    id: r.title_id, title: r.titles!.title, year: r.titles!.release_year, poster_path: r.titles!.poster_path,
    rating: r.rating, hasReasons: (r.aspects ?? []).length > 0,
  }));
}

// Suche: TMDB (findet auch Filme, die noch nicht im Katalog sind) – mit Hinweis, was schon im Katalog ist
export async function searchFavorites(q: string): Promise<FavHit[]> {
  await me();
  const query = q.trim().slice(0, 80);
  if (query.length < 2) return [];
  const admin = createAdminClient();
  try {
    const hits = (await searchTmdb(query)).filter((h) => h.media_type === "movie").slice(0, 8);
    const { data } = await admin.from("titles").select("id,tmdb_id").eq("media_type", "movie").in("tmdb_id", hits.map((h) => h.tmdb_id));
    const ids = new Map((data ?? []).map((t) => [t.tmdb_id as number, t.id as number]));
    return hits.map((h) => ({ tmdb_id: h.tmdb_id, id: ids.get(h.tmdb_id) ?? null, title: h.title, year: h.year, poster_path: h.poster_path }));
  } catch {
    // TMDB gerade nicht erreichbar → nur im eigenen Katalog suchen
    const safe = query.replace(/[%,()]/g, " ");
    const { data } = await admin.from("titles").select("id,tmdb_id,title,release_year,poster_path")
      .eq("media_type", "movie").ilike("title", `%${safe}%`).order("vote_count", { ascending: false }).limit(8);
    return (data ?? []).map((t) => ({ tmdb_id: t.tmdb_id as number, id: t.id as number, title: t.title as string, year: t.release_year ? String(t.release_year) : null, poster_path: t.poster_path as string | null }));
  }
}

// Lieblingsfilm speichern: falls nötig erst in den Katalog holen, dann gesehen + Punkte + ♥
export async function addFavorite(tmdbId: number, rating: number): Promise<{ id: number; info: AspectInfo & { title: string } }> {
  const user = await me();
  const admin = createAdminClient();
  let { data: t } = await admin.from("titles").select(INFO_COLS).eq("media_type", "movie").eq("tmdb_id", tmdbId).maybeSingle();
  if (!t) {
    await admin.from("excluded_titles").delete().eq("media_type", "movie").eq("tmdb_id", tmdbId);
    const row = await fetchTitleRow("movie", tmdbId);
    const ins = await admin.from("titles").upsert(row, { onConflict: "media_type,tmdb_id" }).select(INFO_COLS).single();
    if (ins.error || !ins.data) throw new Error("Film konnte nicht gespeichert werden.");
    t = ins.data;
  }
  const r = Math.max(1, Math.min(10, Math.round(rating)));
  const supabase = await createClient();
  const { error } = await supabase.from("user_title_feedback").upsert(
    { user_id: user.id, title_id: (t as { id: number }).id, status: "gesehen", rating: r, favorite: true, updated_at: new Date().toISOString() },
    { onConflict: "user_id,title_id" },
  );
  if (error) throw new Error("Speichern fehlgeschlagen (wurde die Ergänzung 16 ausgeführt?)");
  const info = t as unknown as AspectInfo & { id: number; title: string };
  return { id: info.id, info };
}
