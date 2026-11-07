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
  discoverYear,
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
import { wikidataInfo, WIKIDATA_VERSION } from "@/lib/wikidata";
import { invalidateCatalogCache } from "@/lib/tasteData";
import { AI_MODELS, costUsd, rateFilm, wikipediaPlots, type AiModelKey, type FilmInput } from "@/lib/aiFeatures";

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

// ---------------- Daten anreichern (Wikidata) ----------------

// Holt Wikidata-Infos für bis zu 150 Filme, die noch nicht mit der aktuellen Abfrage-Version geprüft wurden. Die Seite ruft das so lange auf, bis nichts mehr fehlt.
export async function enrichWikidataChunk(): Promise<{ done: number; found: number; remaining: number }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("titles").select("id,tmdb_id", { count: "exact" })
    .eq("media_type", "movie").or(`wikidata_version.is.null,wikidata_version.lt.${WIKIDATA_VERSION}`).limit(150);
  if (error) throw new Error(error.message + " (wurden die Ergänzungen 11 und 12 im SQL Editor ausgeführt?)");
  if (!data?.length) return { done: 0, found: 0, remaining: 0 };

  const info = await wikidataInfo(data.map((t) => t.tmdb_id as number));
  const now = new Date().toISOString();
  const results = await mapLimit(data, 10, async (t) => {
    const w = info.get(t.tmdb_id as number);
    const { error: e } = await admin.from("titles").update({ ...(w ?? {}), wikidata_checked_at: now, wikidata_version: WIKIDATA_VERSION }).eq("id", t.id);
    if (e) throw new Error(e.message);
  });
  const failed = results.find((r) => r.status === "rejected");
  if (failed && failed.status === "rejected") throw failed.reason;
  return { done: data.length, found: info.size, remaining: Math.max(0, (count ?? 0) - data.length) };
}

// ---------------- TMDB-Empfehlungen ("Wer X mochte, mochte auch …") ----------------

// Wie viele Filme haben noch keine Empfehlungen? null = Ergänzung 17 fehlt
export async function recsStatus(): Promise<{ missing: number; total: number } | null> {
  await requireAdmin();
  const admin = createAdminClient();
  const [m, t] = await Promise.all([
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "movie").is("recs_checked_at", null),
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "movie"),
  ]);
  if (m.error) return null;
  return { missing: m.count ?? 0, total: t.count ?? 0 };
}

// Holt für bis zu 80 Filme die TMDB-Empfehlungen. Die Seite ruft das so lange auf, bis nichts mehr fehlt.
export async function enrichRecsChunk(): Promise<{ done: number; remaining: number; failed: number; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("titles").select("id,tmdb_id", { count: "exact" })
    .eq("media_type", "movie").is("recs_checked_at", null).limit(80);
  if (error) return { done: 0, remaining: 0, failed: 0, error: error.message + " (wurde die Ergänzung 17 im SQL Editor ausgeführt?)" };
  if (!data?.length) return { done: 0, remaining: 0, failed: 0 };
  const now = new Date().toISOString();
  const results = await mapLimit(data, 8, async (t) => {
    const recs = await recommendations(t.tmdb_id as number);
    const { error: e } = await admin.from("titles").update({ tmdb_recs: recs, recs_checked_at: now }).eq("id", t.id);
    if (e) throw new Error(e.message);
  });
  const failed = results.filter((r) => r.status === "rejected");
  // Fehlgeschlagene als geprüft (leer) markieren, damit es nicht hängen bleibt – außer bei Ratenbegrenzung
  const firstErr = failed[0]?.status === "rejected" ? String((failed[0] as PromiseRejectedResult).reason?.message ?? failed[0].reason) : undefined;
  if (failed.length === data.length && firstErr) return { done: 0, remaining: count ?? 0, failed: failed.length, error: firstErr };
  invalidateCatalogCache();
  return { done: data.length - failed.length, remaining: Math.max(0, (count ?? 0) - data.length + failed.length), failed: failed.length, error: firstErr };
}

// ---------------- Stufe 2: KI-Merkmale (Probelauf) ----------------

export type AiScope = "rated" | "test"; // deine bewerteten Filme | Testfilme fürs Modell-Duell
export type AiStatus = { model: AiModelKey; scope: AiScope; done: number; total: number; costUsd: number };

async function scopeIds(scope: AiScope) {
  const user = await getUser();
  const rows = scope === "test"
    ? await fetchAll<{ title_id: number }>((from, to) =>
        createAdminClient().from("ai_duel").select("title_id").eq("user_id", user!.id).range(from, to),
      ).catch(() => [])
    : await fetchAll<{ title_id: number }>((from, to) =>
        createAdminClient().from("user_title_feedback").select("title_id")
          .eq("user_id", user!.id).eq("status", "gesehen").not("rating", "is", null).range(from, to),
      );
  return rows.map((r) => r.title_id);
}

// Stand des Probelaufs je Modell (für die Datenlage-Seite)
export async function aiPilotStatus(scope: AiScope = "rated"): Promise<AiStatus[] | null> {
  await requireAdmin();
  const ids = new Set(await scopeIds(scope));
  const res = await fetchAll<{ title_id: number; model: string; input_tokens: number; output_tokens: number }>((from, to) =>
    createAdminClient().from("title_features").select("title_id,model,input_tokens,output_tokens").range(from, to),
  ).catch(() => null);
  if (!res) return null; // Ergänzung 13 fehlt noch
  return (Object.keys(AI_MODELS) as AiModelKey[]).map((model) => {
    const rows = res.filter((r) => r.model === model);
    const mine = rows.filter((r) => ids.has(r.title_id));
    const cost = costUsd(model, mine.reduce((s, r) => s + r.input_tokens, 0), mine.reduce((s, r) => s + r.output_tokens, 0));
    return { model, scope, done: mine.length, total: ids.size, costUsd: cost };
  });
}

// Schätzt die nächsten paar deiner bewerteten Filme ein (Haiku 6, Sonnet 3 – Sonnet ist langsamer). Die Seite ruft das so lange auf, bis alle fertig sind.
// Fehler werden als Text zurückgegeben (nicht geworfen) – sonst blendet Next.js sie in der
// veröffentlichten Version aus, und man sieht nur "Verbindung abgebrochen".
export async function aiPilotChunk(model: AiModelKey, scope: AiScope = "rated"): Promise<{ done: number; remaining: number; errors: string[]; fatal?: string }> {
  try {
    await requireAdmin();
    if (!(model in AI_MODELS)) return { done: 0, remaining: 0, errors: [], fatal: "Unbekanntes Modell." };
    const admin = createAdminClient();
    const ids = await scopeIds(scope);
    const { data: have, error } = await admin.from("title_features").select("title_id").eq("model", model).limit(10000);
    if (error) return { done: 0, remaining: 0, errors: [], fatal: error.message + " (wurde die Ergänzung 13 im SQL Editor ausgeführt?)" };
    const done = new Set((have ?? []).map((r) => r.title_id as number));
    const todo = ids.filter((id) => !done.has(id));
    const batch = todo.slice(0, model === "sonnet" ? 2 : 6);
    if (!batch.length) return { done: 0, remaining: 0, errors: [] };

    const { data: films } = await admin.from("titles")
      .select("id,tmdb_id,media_type,title,original_title,release_year,directors,cast_names,genres,overview").in("id", batch);
    const movies = (films ?? []) as (FilmInput & { id: number; tmdb_id: number; media_type: string })[];
    const plots = await wikipediaPlots(movies.filter((f) => f.media_type === "movie").map((f) => f.tmdb_id));

    const results = await mapLimit(movies, 6, async (f) => {
      const plot = f.media_type === "movie" ? plots.get(f.tmdb_id) ?? null : null;
      const r = await rateFilm(model, f, plot);
      const { error: e } = await admin.from("title_features").upsert({
        title_id: f.id, model, features: r.features, had_plot: !!plot, input_tokens: r.inputTokens, output_tokens: r.outputTokens,
      });
      if (e) throw new Error(e.message);
    });
    const errors = results.flatMap((r) => (r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []));
    const ok = results.length - errors.length;
    // Klappt kein einziger Film, ist es ein grundsätzliches Problem (Schlüssel, Guthaben, Modell) → anhalten
    if (ok === 0) return { done: 0, remaining: todo.length, errors, fatal: errors[0] };
    return { done: ok, remaining: todo.length - ok, errors };
  } catch (e) {
    return { done: 0, remaining: 0, errors: [], fatal: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------- Katalog auffüllen (ein Knopf, sinnvolle Auswahl) ----------------
// Pro Jahr ab 1990: zwei Drittel die meistgesehenen, ein Drittel die bestbewerteten Filme –
// so kommen Blockbuster und Kritikerlieblinge gleichermaßen hinein. Alle Katalog-Regeln gelten.
export type FillResult = { added: number; skipped: number; why: Partial<ImportResult>; error?: string };

export async function fillCatalogYear(
  year: number, perYear: number, opts: { noKids?: boolean; allowNetflix?: boolean; minVotes?: number } = {},
): Promise<FillResult> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const settings = await getCatalogSettings();
    // Ältere Filme haben bei TMDB weniger Stimmen – dort etwas großzügiger
    const minVotes = Math.round((opts.minVotes ?? settings.min_votes) * (year < 2000 ? 0.6 : 1));
    const want = Math.max(5, Math.min(200, perYear));
    const wantPopular = Math.round(want * 0.67);

    // Blättert so lange weiter, bis genug NEUE Filme gefunden sind (Bekanntes wird übersprungen)
    async function collect(sort: "votes" | "rating", need: number, maxPages: number, exclude: Set<number>) {
      const found: number[] = [];
      for (let p = 1; p <= maxPages && found.length < need; p++) {
        const r = await discoverYear(year, sort, p, !!opts.noKids, minVotes, settings.min_rating);
        const ids = r.ids.filter((id) => !exclude.has(id));
        if (ids.length) {
          const [{ data: have }, { data: blocked }] = await Promise.all([
            admin.from("titles").select("tmdb_id").eq("media_type", "movie").in("tmdb_id", ids),
            admin.from("excluded_titles").select("tmdb_id").eq("media_type", "movie").in("tmdb_id", ids),
          ]);
          const skip = new Set([...(have ?? []), ...(blocked ?? [])].map((x) => x.tmdb_id as number));
          for (const id of ids) if (!skip.has(id) && found.length < need) { found.push(id); exclude.add(id); }
        }
        if (p >= r.totalPages) break;
      }
      return found;
    }
    const taken = new Set<number>();
    // etwas mehr holen, weil die Regeln (Qualität, Herkunft, Kinderfilme …) noch aussortieren
    const popular = await collect("votes", Math.ceil(wantPopular * 1.4), 12, taken);
    const acclaimed = await collect("rating", Math.ceil((want - wantPopular) * 1.4), 6, taken);
    // Mischung ⅔ / ⅓ – erst genau so viele importieren wie gewünscht, dann Ausfälle mit Reserve auffüllen
    const first = [...popular.slice(0, wantPopular), ...acclaimed.slice(0, want - wantPopular)];
    const reserve = [...popular.slice(wantPopular), ...acclaimed.slice(want - wantPopular)];
    const importOpts = { gate: true, skipExisting: true, source: "Katalog auffüllen", noKids: opts.noKids, allowNetflix: opts.allowNetflix, minVotes };
    let res = await importMovieIds(first, importOpts);
    let tried = first.length;
    if (res.ok < want && reserve.length) {
      const more = reserve.slice(0, want - res.ok);
      res = addResults(res, await importMovieIds(more, importOpts));
      tried += more.length;
    }
    if (res.ok) invalidateCatalogCache();
    return { added: res.ok, skipped: tried - res.ok, why: res };
  } catch (e) {
    return { added: 0, skipped: 0, why: {}, error: e instanceof Error ? e.message : String(e) };
  }
}
