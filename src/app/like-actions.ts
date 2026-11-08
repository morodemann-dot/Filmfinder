"use server";

// "Etwas wie …": Filme im Katalog suchen, die als Vorbild dienen
import { createAdminClient, getUser } from "@/lib/supabase/server";

export type LikeHit = { id: number; title: string; year: number | null; poster_path: string | null };

export async function searchCatalog(q: string): Promise<LikeHit[]> {
  if (!(await getUser())) return [];
  const term = q.trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (term.length < 2) return [];
  const { data } = await createAdminClient().from("titles").select("id,title,original_title,release_year,poster_path")
    .eq("media_type", "movie").or(`title.ilike.%${term}%,original_title.ilike.%${term}%`)
    .order("vote_count", { ascending: false, nullsFirst: false }).limit(8);
  return (data ?? []).map((t) => ({ id: t.id as number, title: t.title as string, year: (t.release_year as number | null) ?? null, poster_path: (t.poster_path as string | null) ?? null }));
}
