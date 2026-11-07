// Gemeinsame Import-Logik für alle Wege, auf denen Filme in den Katalog kommen.
// Läuft nur auf dem Server.
//
// Ablauf für jeden Film:
//  1. Sperrliste?            → überspringen
//  2. Schon im Katalog?      → bei Vorschau überspringen, sonst Daten auffrischen
//  3. Details von TMDB holen
//  4. Regeln prüfen: Kurzfilm (< 45 Min.), Netflix, Herkunft, (große Studios), Qualitätsschwelle
//  5. Direkt in den Katalog ODER als Kandidat in die Vorschau

import { createAdminClient } from "@/lib/supabase/server";
import { fetchTitleRow, hasMajorStudio, isNetflix, mapLimit } from "@/lib/tmdb";
import { excludedOrigin } from "@/lib/origin";

export type CatalogSettings = { min_rating: number; min_votes: number; series_exempt: boolean };
export const DEFAULT_SETTINGS: CatalogSettings = { min_rating: 6.3, min_votes: 1500, series_exempt: true };

export async function getCatalogSettings(): Promise<CatalogSettings> {
  const { data } = await createAdminClient().from("catalog_settings").select("min_rating,min_votes,series_exempt").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    min_rating: Number(data.min_rating),
    min_votes: Number(data.min_votes),
    series_exempt: !!data.series_exempt,
  };
}

export type ImportOpts = {
  onlyMajor?: boolean; // nur Filme großer Studios
  series?: boolean; // Import einer Filmreihe (darf ggf. schwächere Teile enthalten)
  stage?: boolean; // erst in die Vorschau statt direkt in den Katalog
  source?: string; // Woher? (wird bei Kandidaten angezeigt)
  gate?: boolean; // Qualitätsschwelle prüfen (Standard: ja)
};

export type ImportResult = {
  ok: number; staged: number; failed: number; netflix: number; small: number; origin: number; quality: number; short: number;
};

// Kürzere Filme (oder ohne Laufzeitangabe) gelten als Kurzfilm/Musikvideo und kommen nicht in den Katalog.
export const MIN_RUNTIME_MIN = 45;
export function isShortFilm(t: { runtime_seconds: number | null }) {
  return !t.runtime_seconds || t.runtime_seconds < MIN_RUNTIME_MIN * 60;
}

export const EMPTY_RESULT: ImportResult = { ok: 0, staged: 0, failed: 0, netflix: 0, small: 0, origin: 0, quality: 0, short: 0 };

export function addResults(a: ImportResult, b: ImportResult): ImportResult {
  return {
    ok: a.ok + b.ok, staged: a.staged + b.staged, failed: a.failed + b.failed, netflix: a.netflix + b.netflix,
    small: a.small + b.small, origin: a.origin + b.origin, quality: a.quality + b.quality, short: a.short + b.short,
  };
}

export function summary(s: Partial<ImportResult>) {
  const parts: string[] = [];
  if (s.staged) parts.push(`${s.staged} neue Kandidaten warten auf deine Prüfung`);
  if (s.ok || !s.staged) parts.push(`${s.ok ?? 0} Filme übernommen`);
  if (s.quality) parts.push(`${s.quality} unter der Qualitätsschwelle`);
  if (s.short) parts.push(`${s.short} Kurzfilme/ohne Laufzeit übersprungen`);
  if (s.netflix) parts.push(`${s.netflix} Netflix-Filme aussortiert`);
  if (s.origin) parts.push(`${s.origin} wegen Herkunft übersprungen`);
  if (s.small) parts.push(`${s.small} ohne großes Studio`);
  if (s.failed) parts.push(`${s.failed} fehlgeschlagen`);
  return parts.join(", ");
}

export async function importMovieIds(ids: number[], opts: ImportOpts = {}): Promise<ImportResult> {
  const admin = createAdminClient();
  const res: ImportResult = { ...EMPTY_RESULT };
  ids = [...new Set(ids)];
  if (!ids.length) return res;

  // 1) Sperrliste
  const { data: blocked } = await admin.from("excluded_titles").select("tmdb_id").eq("media_type", "movie").in("tmdb_id", ids);
  const blockedSet = new Set((blocked ?? []).map((b) => b.tmdb_id as number));
  ids = ids.filter((x) => !blockedSet.has(x));

  // 2) Bei Vorschau: was schon im Katalog oder schon als Kandidat wartet, überspringen
  if (opts.stage && ids.length) {
    const [{ data: inCatalog }, { data: waiting }] = await Promise.all([
      admin.from("titles").select("tmdb_id").eq("media_type", "movie").in("tmdb_id", ids),
      admin.from("import_candidates").select("tmdb_id").eq("media_type", "movie").in("tmdb_id", ids),
    ]);
    const skip = new Set([...(inCatalog ?? []), ...(waiting ?? [])].map((r) => r.tmdb_id as number));
    ids = ids.filter((x) => !skip.has(x));
  }
  if (!ids.length) return res;

  const settings = opts.gate === false ? null : await getCatalogSettings();

  // 3) + 4)
  const results = await mapLimit(ids, 8, (id) => fetchTitleRow("movie", id));
  const rows: Awaited<ReturnType<typeof fetchTitleRow>>[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") { res.failed++; continue; }
    const t = r.value;
    if (isShortFilm(t)) { res.short++; continue; } // Kurzfilme & Musikvideos: nie, auch nicht bei Preisen
    if (isNetflix(t.studios)) { res.netflix++; continue; }
    const awarded = t.oscars.length + t.globes.length > 0;
    if (!awarded && excludedOrigin(t)) { res.origin++; continue; }
    if (opts.onlyMajor && !hasMajorStudio(t.studios)) { res.small++; continue; }
    if (settings) {
      // Ausnahmen von der Qualitätsschwelle: Preisträger, Festival-Gewinner, Kanon, ggf. Filmreihen
      const exempt = awarded || t.festivals.length > 0 || t.canon.length > 0 ||
        (opts.series && settings.series_exempt && !!t.collection_id);
      const weak = (t.vote_average ?? 0) < settings.min_rating || (t.vote_count ?? 0) < settings.min_votes;
      if (!exempt && weak) { res.quality++; continue; }
    }
    rows.push(t);
  }
  if (!rows.length) return res;

  // 5)
  if (opts.stage) {
    const { error } = await admin.from("import_candidates").upsert(
      rows.map((row) => ({ media_type: "movie", tmdb_id: row.tmdb_id, row, source: opts.source ?? null, status: "offen" })),
      { onConflict: "media_type,tmdb_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message + " (wurde die Ergänzung 10 im SQL Editor ausgeführt?)");
    res.staged = rows.length;
  } else {
    const { error } = await admin.from("titles").upsert(rows, { onConflict: "media_type,tmdb_id" });
    if (error) throw new Error(error.message);
    res.ok = rows.length;
  }
  return res;
}
