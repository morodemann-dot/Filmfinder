"use server";

// Server-Aktionen rund um das Füllen des Katalogs:
// Katalog-Regeln, Vorschau (Kandidaten prüfen) und die neuen Quellen.

import { revalidatePath } from "next/cache";
import { createAdminClient, getUser, isAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import {
  DEFAULT_SETTINGS,
  EMPTY_RESULT,
  addResults,
  getCatalogSettings,
  importMovieIds,
  summary,
  type CatalogSettings,
  type ImportResult,
} from "@/lib/importer";
import {
  CANON_FILMS,
  DECADES,
  FESTIVAL_FILMS,
  MOVIE_GENRES,
  discoverBest,
  findCompany,
  findKeyword,
  mapLimit,
  recommendations,
  type DecadeKey,
} from "@/lib/tmdb";
import type { CurationCard, CurationFilter, FormState } from "@/app/actions";

async function requireAdmin() {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
}

// ---------------- Katalog-Regeln ----------------

export async function loadSettings(): Promise<CatalogSettings> {
  await requireAdmin();
  return getCatalogSettings();
}

export async function saveSettings(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const min_rating = Math.min(10, Math.max(0, Number(String(formData.get("min_rating")).replace(",", ".")) || 0));
  const min_votes = Math.max(0, Math.round(Number(formData.get("min_votes")) || 0));
  const series_exempt = formData.get("series_exempt") === "on";
  const { error } = await createAdminClient()
    .from("catalog_settings")
    .upsert({ id: 1, min_rating, min_votes, series_exempt, updated_at: new Date().toISOString() });
  if (error) return { error: error.message + " (wurde die Ergänzung 10 im SQL Editor ausgeführt?)" };
  revalidatePath("/admin");
  return { message: "Gespeichert – gilt ab dem nächsten Import." };
}

export async function resetSettings(): Promise<CatalogSettings> {
  await requireAdmin();
  await createAdminClient().from("catalog_settings").upsert({ id: 1, ...DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}

// ---------------- Listen-Importe in Etappen (Festivals, Kanon) ----------------

export type ListKey = "festivals" | "canon";
export type ListChunkResult = ImportResult & { next: number | null; total: number };

export async function importListChunk(list: ListKey, offset: number, stage: boolean): Promise<ListChunkResult> {
  await requireAdmin();
  // Einheitliche Form: tmdb + Werte für die passende Spalte
  const all: { tmdb: number; values: string[] }[] =
    list === "festivals"
      ? FESTIVAL_FILMS.map((f) => ({ tmdb: f.tmdb, values: f.awards }))
      : CANON_FILMS.map((f) => ({ tmdb: f.tmdb, values: f.lists }));
  const chunk = all.slice(offset, offset + 40);
  const source = list === "festivals" ? "Festival-/BAFTA-Gewinner" : "Kritiker-Kanon";
  const r = await importMovieIds(chunk.map((f) => f.tmdb), { stage, source });

  // Bei schon vorhandenen Filmen die Auszeichnungen nachtragen
  const admin = createAdminClient();
  await mapLimit(chunk, 8, async (f) => {
    const col = list === "festivals" ? { festivals: f.values } : { canon: f.values };
    await admin.from("titles").update(col).eq("media_type", "movie").eq("tmdb_id", f.tmdb);
  });

  const next = offset + chunk.length;
  if (next >= all.length) revalidatePath("/", "layout");
  return { ...r, next: next < all.length ? next : null, total: all.length };
}

// ---------------- Beste nach Genre / Jahrzehnt / Stichwort / Studio ----------------

export async function importBest(_: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const settings = await getCatalogSettings();
    const genre = Number(formData.get("genre")) || undefined;
    const decadeRaw = String(formData.get("decade") ?? "");
    const decade = decadeRaw in DECADES ? (decadeRaw as DecadeKey) : undefined;
    const region = formData.get("region") === "welt" ? "welt" : "west";
    const keywordText = String(formData.get("keyword") ?? "").trim();
    const companyText = String(formData.get("company") ?? "").trim();
    const stage = formData.get("vorschau") === "on";
    const from = Math.max(1, Number(formData.get("from")) || 1);
    const pages = Math.min(5, Math.max(1, Number(formData.get("pages")) || 1));

    let keyword: { id: number; name: string } | null = null;
    if (keywordText) {
      keyword = await findKeyword(keywordText);
      if (!keyword) return { error: `Kein Stichwort gefunden für „${keywordText}“. Tipp: englische Begriffe, z. B. „heist“, „time travel“.` };
    }
    let company: { id: number; name: string } | null = null;
    if (companyText) {
      company = await findCompany(companyText);
      if (!company) return { error: `Kein Studio gefunden für „${companyText}“.` };
    }
    if (!genre && !decade && !keyword && !company) return { error: "Bitte mindestens Genre, Jahrzehnt, Stichwort oder Studio wählen." };

    const label = [
      genre ? MOVIE_GENRES[genre] : null,
      decade ? DECADES[decade].label : null,
      keyword ? `„${keyword.name}“` : null,
      company ? company.name : null,
    ].filter(Boolean).join(" · ");

    let total: ImportResult = { ...EMPTY_RESULT };
    let lastPage = from - 1;
    let totalPages = 0;
    for (let p = from; p < from + pages; p++) {
      const d = await discoverBest({
        genre, decade, keyword: keyword?.id, company: company?.id, region,
        minRating: settings.min_rating, minVotes: settings.min_votes, page: p,
        sort: company ? "votes" : "rating",
      });
      totalPages = d.totalPages;
      if (p > d.totalPages || !d.ids.length) break;
      total = addResults(total, await importMovieIds(d.ids, { stage, source: label }));
      lastPage = p;
    }
    revalidatePath("/", "layout");
    const more = lastPage < totalPages ? ` Für mehr: „Ab Seite“ ${lastPage + 1} (von ${totalPages}).` : " Alles Passende ist drin.";
    return { message: `${label}: ${summary(total)}.${more}` };
  } catch (e) {
    return { error: "Fehler beim Import: " + (e instanceof Error ? e.message : String(e)) };
  }
}

// ---------------- Ähnlich zu euren Lieblingsfilmen ----------------

export async function importSimilar(_: FormState, formData: FormData): Promise<FormState> {
  try {
    await requireAdmin();
    const minScore = Math.min(10, Math.max(1, Number(formData.get("minScore")) || 8));
    const stage = formData.get("vorschau") === "on";
    const admin = createAdminClient();

    // Filme, die irgendwer (du oder deine Freunde) mit mindestens minScore bewertet hat
    const liked = await fetchAll<{ titles: { tmdb_id: number; media_type: string } | null }>((from, to) =>
      admin.from("user_title_feedback").select("titles(tmdb_id,media_type)").gte("rating", minScore).range(from, to),
    );
    const seeds = [...new Set(liked.filter((l) => l.titles?.media_type === "movie").map((l) => l.titles!.tmdb_id))];
    if (!seeds.length) return { error: `Noch keine Filme mit ${minScore} oder mehr Punkten bewertet.` };

    // Pro Klick 25 zufällige Lieblingsfilme als Ausgangspunkt
    const pick = seeds.sort(() => Math.random() - 0.5).slice(0, 25);
    const counts = new Map<number, number>();
    const res = await mapLimit(pick, 8, (id) => recommendations(id));
    for (const r of res) if (r.status === "fulfilled") for (const id of r.value) counts.set(id, (counts.get(id) ?? 0) + 1);

    // Was öfter empfohlen wird, zuerst
    const ids = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 80);
    const r = await importMovieIds(ids, { stage, source: "Ähnlich zu euren Lieblingsfilmen" });
    revalidatePath("/", "layout");
    return { message: `${pick.length} Lieblingsfilme als Ausgangspunkt: ${summary(r)}. Nochmal klicken für andere Ausgangsfilme.` };
  } catch (e) {
    return { error: "Fehler beim Import: " + (e instanceof Error ? e.message : String(e)) };
  }
}

// ---------------- Vorschau: Kandidaten prüfen ----------------

type CandidateRow = { id: number; tmdb_id: number; media_type: string; source: string | null; created_at: string; row: Record<string, unknown> };

function toCard(c: CandidateRow): CurationCard {
  const r = c.row as Record<string, never>;
  return {
    id: c.id, // Kandidaten-ID (nicht Katalog-ID!)
    tmdb_id: c.tmdb_id,
    media_type: c.media_type,
    title: r.title ?? "",
    release_year: r.release_year ?? null,
    genres: r.genres ?? [],
    directors: r.directors ?? [],
    cast_names: r.cast_names ?? [],
    overview: r.overview ?? null,
    poster_path: r.poster_path ?? null,
    popularity: r.popularity ?? null,
    runtime_seconds: r.runtime_seconds ?? null,
    oscars: r.oscars ?? [],
    globes: r.globes ?? [],
    vote_average: r.vote_average ?? null,
    vote_count: r.vote_count ?? null,
    original_language: r.original_language ?? null,
    countries: r.countries ?? [],
    source: c.source,
  };
}

export async function candidateCount(): Promise<number> {
  await requireAdmin();
  const { count } = await createAdminClient().from("import_candidates").select("id", { count: "exact", head: true }).eq("status", "offen");
  return count ?? 0;
}

export async function getCandidateBatch(f: CurationFilter, skip: number[]): Promise<{ cards: CurationCard[]; remaining: number }> {
  await requireAdmin();
  const rows = await fetchAll<CandidateRow>((from, to) =>
    createAdminClient().from("import_candidates").select("id,tmdb_id,media_type,source,created_at,row").eq("status", "offen").range(from, to),
  ).catch((e: Error) => {
    throw new Error(e.message + " (wurde die Ergänzung 10 im SQL Editor ausgeführt?)");
  });
  const skipSet = new Set(skip);
  let cards = rows.map(toCard).filter((c) => !skipSet.has(c.id));
  if (f.genre) cards = cards.filter((c) => c.genres.includes(f.genre!));
  if (f.decade) cards = cards.filter((c) => c.release_year != null && c.release_year >= f.decade! && c.release_year < f.decade! + 10);
  const remaining = cards.length;
  if (f.order === "schwach") cards.sort((a, b) => (a.vote_average ?? 0) - (b.vote_average ?? 0));
  else if (f.order === "unbekannt") cards.sort((a, b) => (a.vote_count ?? 0) - (b.vote_count ?? 0));
  else if (f.order === "zufall") cards.sort(() => Math.random() - 0.5);
  else cards.sort((a, b) => b.id - a.id); // zuletzt vorgeschlagen zuerst
  return { cards: cards.slice(0, 30), remaining };
}

async function getCandidate(id: number) {
  const { data } = await createAdminClient().from("import_candidates").select("id,tmdb_id,media_type,row,status").eq("id", id).maybeSingle();
  if (!data) throw new Error("Kandidat nicht gefunden.");
  return data as CandidateRow & { status: string };
}

// Annehmen = in den Katalog. accept=false macht das rückgängig.
export async function acceptCandidate(id: number, accept: boolean) {
  await requireAdmin();
  const admin = createAdminClient();
  const c = await getCandidate(id);
  if (accept) {
    const { error } = await admin.from("titles").upsert(c.row, { onConflict: "media_type,tmdb_id" });
    if (error) throw new Error(error.message);
    await admin.from("import_candidates").update({ status: "angenommen" }).eq("id", id);
  } else {
    await admin.from("titles").delete().eq("media_type", c.media_type).eq("tmdb_id", c.tmdb_id);
    await admin.from("import_candidates").update({ status: "offen" }).eq("id", id);
  }
}

// Ablehnen = auf die Sperrliste. reject=false macht das rückgängig.
export async function rejectCandidate(id: number, reject: boolean) {
  await requireAdmin();
  const admin = createAdminClient();
  const c = await getCandidate(id);
  if (reject) {
    await admin.from("excluded_titles").upsert(
      { media_type: c.media_type, tmdb_id: c.tmdb_id, title: (c.row as { title?: string }).title ?? null },
      { onConflict: "media_type,tmdb_id" },
    );
    await admin.from("import_candidates").update({ status: "abgelehnt" }).eq("id", id);
  } else {
    await admin.from("excluded_titles").delete().eq("media_type", c.media_type).eq("tmdb_id", c.tmdb_id);
    await admin.from("import_candidates").update({ status: "offen" }).eq("id", id);
  }
}

// Alle offenen Kandidaten auf einmal übernehmen
export async function acceptAllCandidates(): Promise<{ accepted: number }> {
  await requireAdmin();
  const admin = createAdminClient();
  const rows = await fetchAll<CandidateRow>((from, to) =>
    admin.from("import_candidates").select("id,tmdb_id,media_type,row").eq("status", "offen").range(from, to),
  );
  for (let i = 0; i < rows.length; i += 100) {
    const part = rows.slice(i, i + 100);
    const { error } = await admin.from("titles").upsert(part.map((r) => r.row), { onConflict: "media_type,tmdb_id" });
    if (error) throw new Error(error.message);
    await admin.from("import_candidates").update({ status: "angenommen" }).in("id", part.map((r) => r.id));
  }
  revalidatePath("/", "layout");
  return { accepted: rows.length };
}

// Alle offenen Kandidaten verwerfen (ohne Sperrliste – sie können später wieder vorgeschlagen werden)
export async function discardAllCandidates(): Promise<{ discarded: number }> {
  await requireAdmin();
  const { count } = await createAdminClient().from("import_candidates").delete({ count: "exact" }).eq("status", "offen");
  return { discarded: count ?? 0 };
}
