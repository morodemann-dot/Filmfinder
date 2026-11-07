"use server";

// "Server-Aktionen": Funktionen, die auf dem Server laufen, wenn man in der App
// einen Knopf drückt. Geheime Schlüssel bleiben so immer auf dem Server.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { excludedOrigin, originOrFilterParts } from "@/lib/origin";
import { EMPTY_RESULT, addResults, importMovieIds, summary } from "@/lib/importer";
import {
  AWARD_FILMS,
  actorMovies,
  DECADES,
  IMPORT_LISTS,
  isShortOnly,
  collectionParts,
  keywordMovies,
  searchCollections,
  tmdbIdFromImdb,
  directorMovies,
  discoverHollywood,
  fetchListIds,
  fetchTitleRow,
  mapLimit,
  type DecadeKey,
  type ImportListKey,
  type MediaType,
} from "@/lib/tmdb";
import type { Status } from "@/lib/types";

// ---------------- Anmeldung ----------------

export type FormState = { error?: string; message?: string };

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Anmeldung fehlgeschlagen. Stimmen E-Mail und Passwort?" };
  redirect("/");
}

// Registrieren geht nur mit dem Einladungscode – so kommen nur deine Freunde rein.
export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!process.env.INVITE_CODE || code !== process.env.INVITE_CODE.trim())
    return { error: "Der Einladungscode stimmt nicht." };
  if (password.length < 8) return { error: "Das Passwort braucht mindestens 8 Zeichen." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    return {
      error: error.message.includes("already")
        ? "Für diese E-Mail gibt es schon ein Konto."
        : `Konto konnte nicht angelegt werden. Meldung von Supabase: ${error.message}`,
    };
  }
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/bewerten");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------- Bewerten & Bibliothek ----------------

export async function setFeedback(titleId: number, status: Status | null, rating: number | null) {
  await writeFeedback(titleId, status, rating);
  revalidatePath("/bibliothek");
  revalidatePath(`/titel/${titleId}`);
}

// Wie setFeedback, aber OHNE dass die aktuelle Seite danach neu berechnet wird.
// Für Kartenstapel (Filmfinder, Bewerten): Sonst springt der Stapel zurück und es ruckelt.
export async function saveFeedbackQuiet(titleId: number, status: Status | null, rating: number | null, reason?: string | null) {
  await writeFeedback(titleId, status, rating, reason);
}

// Lieblingsfilm an/aus. Ein Lieblingsfilm gilt immer als gesehen (Punkte bleiben, wie sie sind).
export async function setFavorite(titleId: number, on: boolean) {
  const user = await getUser();
  if (!user) throw new Error("Nicht angemeldet");
  const supabase = await createClient();
  const { data: row } = await supabase.from("user_title_feedback").select("status").eq("user_id", user.id).eq("title_id", titleId).maybeSingle();
  const { error } = row
    ? await supabase.from("user_title_feedback")
        .update({ favorite: on, ...(on && row.status !== "gesehen" ? { status: "gesehen", rating: null } : {}), updated_at: new Date().toISOString() })
        .eq("user_id", user.id).eq("title_id", titleId)
    : await supabase.from("user_title_feedback").insert({ user_id: user.id, title_id: titleId, status: "gesehen", favorite: on });
  if (error) throw new Error("Speichern fehlgeschlagen (wurde die Ergänzung 16 ausgeführt?)");
}

// Antwort auf "Was hat gefallen / gestört?" speichern (zum bestehenden Eintrag)
export async function saveAspects(titleId: number, aspects: string[]) {
  const user = await getUser();
  if (!user) throw new Error("Nicht angemeldet");
  const supabase = await createClient();
  const clean = aspects.filter((a) => /^[+-][a-z_]+:.{1,120}$/.test(a)).slice(0, 5);
  const { error } = await supabase.from("user_title_feedback").update({ aspects: clean }).eq("user_id", user.id).eq("title_id", titleId);
  if (error) throw new Error("Speichern fehlgeschlagen (wurde die Ergänzung 15 ausgeführt?)");
}

// "Heute nicht" (7 Tage) / "Vielleicht später" (30 Tage) – days = 0 hebt die Pause auf
export async function snoozeTitle(titleId: number, days: number) {
  const user = await getUser();
  if (!user) throw new Error("Nicht angemeldet");
  const supabase = await createClient();
  if (days <= 0) {
    await supabase.from("snoozed").delete().eq("user_id", user.id).eq("title_id", titleId);
    return;
  }
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  await supabase.from("snoozed").upsert({ user_id: user.id, title_id: titleId, until });
}

// Profil für Freunde-Funktionen
export async function saveProfile(displayName: string, shareTogether: boolean) {
  const user = await getUser();
  if (!user) throw new Error("Nicht angemeldet");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id, display_name: displayName.trim().slice(0, 40) || null, share_together: shareTogether, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Speichern fehlgeschlagen (wurde die Ergänzung 15 ausgeführt?)");
  revalidatePath("/", "layout");
}

async function writeFeedback(titleId: number, status: Status | null, rating: number | null, reason?: string | null) {
  const user = await getUser();
  if (!user) throw new Error("Nicht angemeldet");
  const supabase = await createClient();

  if (status === null) {
    // Eintrag entfernen ("zurücksetzen")
    await supabase.from("user_title_feedback").delete().eq("user_id", user.id).eq("title_id", titleId);
  } else {
    const r = status === "gesehen" && rating ? Math.min(10, Math.max(1, Math.round(rating))) : null;
    const { error } = await supabase.from("user_title_feedback").upsert({
      user_id: user.id,
      title_id: titleId,
      status,
      rating: r,
      reason: status === "nicht_interessiert" ? (reason ?? null) : null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Speichern fehlgeschlagen");
  }
}

// ---------------- Katalog füllen ----------------

// Fügt einen einzelnen Titel aus der TMDB-Suche dem Katalog hinzu und öffnet ihn.
export async function addFromTmdb(type: MediaType, tmdbId: number) {
  const user = await getUser();
  if (!user) throw new Error("Nicht angemeldet");
  const admin = createAdminClient();

  const existing = await admin
    .from("titles")
    .select("id")
    .eq("media_type", type)
    .eq("tmdb_id", tmdbId)
    .maybeSingle();
  if (existing.data) redirect(`/titel/${existing.data.id}`);

  // Bewusst hinzugefügt: falls aussortiert, von der Sperrliste nehmen
  await admin.from("excluded_titles").delete().eq("media_type", type).eq("tmdb_id", tmdbId);

  const row = await fetchTitleRow(type, tmdbId);
  const { data, error } = await admin
    .from("titles")
    .upsert(row, { onConflict: "media_type,tmdb_id" })
    .select("id")
    .single();
  if (error || !data) throw new Error("Titel konnte nicht gespeichert werden");
  redirect(`/titel/${data.id}`);
}

// Importiert mehrere Seiten einer TMDB-Liste (je Seite 20 Titel). Nur für Admins.
export async function importList(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return { error: "Nur für Admins." };

  const key = String(formData.get("list")) as ImportListKey;
  if (!(key in IMPORT_LISTS)) return { error: "Unbekannte Liste." };
  const from = Math.max(1, Number(formData.get("from")) || 1);
  const pages = Math.min(5, Math.max(1, Number(formData.get("pages")) || 1));

  const admin = createAdminClient();
  let ok = 0;
  let failed = 0;

  for (let p = from; p < from + pages; p++) {
    const { type, ids } = await fetchListIds(key, p);
    const results = await mapLimit(ids, 8, (id) => fetchTitleRow(type, id));
    const rows = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    failed += results.length - rows.length;
    if (rows.length) {
      const { error } = await admin.from("titles").upsert(rows, { onConflict: "media_type,tmdb_id" });
      if (error) return { error: "Fehler beim Speichern: " + error.message };
      ok += rows.length;
    }
  }

  const { count } = await admin.from("titles").select("id", { count: "exact", head: true });
  revalidatePath("/", "layout");
  return {
    message: `${ok} Titel importiert/aktualisiert${failed ? `, ${failed} fehlgeschlagen` : ""}. Katalog jetzt: ${count ?? "?"} Titel. Nächste Startseite: ${from + pages}.`,
  };
}

async function catalogMovieCount() {
  const { count } = await createAdminClient()
    .from("titles").select("id", { count: "exact", head: true }).eq("media_type", "movie");
  return count ?? 0;
}


// Hollywood-Filme eines Jahrzehnts importieren. Nur für Admins.
export async function importHollywood(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return { error: "Nur für Admins." };

  const decade = String(formData.get("decade")) as DecadeKey;
  if (!(decade in DECADES)) return { error: "Unbekanntes Jahrzehnt." };
  const minVotes = Math.max(0, Number(formData.get("minVotes")) || 0);
  const onlyMajor = formData.get("onlyMajor") === "on";
  const stage = formData.get("vorschau") === "on";
  const from = Math.max(1, Number(formData.get("from")) || 1);
  const pages = Math.min(5, Math.max(1, Number(formData.get("pages")) || 1));

  let total = { ...EMPTY_RESULT };
  let lastPage = from - 1;
  let totalPages = 0;
  try {
    for (let p = from; p < from + pages; p++) {
      const d = await discoverHollywood(decade, minVotes, p);
      totalPages = d.totalPages;
      if (p > d.totalPages || d.ids.length === 0) break;
      const r = await importMovieIds(d.ids, { onlyMajor, stage, source: `Hollywood ${DECADES[decade].label}` });
      total = addResults(total, r);
      lastPage = p;
    }
  } catch (e) {
    return { error: "Fehler beim Import: " + (e instanceof Error ? e.message : String(e)) };
  }

  revalidatePath("/", "layout");
  const more = lastPage < totalPages
    ? `Für mehr: „Ab Seite“ ${lastPage + 1} (von ${totalPages}).`
    : "Alle passenden Filme dieses Jahrzehnts sind drin.";
  return { message: `${DECADES[decade].label}: ${summary(total)}. Filme im Katalog: ${await catalogMovieCount()}. ${more}` };
}

// Alle Filme einer Regie-Person importieren. Nur für Admins.
export async function importDirector(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return { error: "Nur für Admins." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Bitte einen Namen eingeben." };
  const minVotes = Math.max(0, Number(formData.get("minVotes")) || 0);
  const stage = formData.get("vorschau") === "on";

  try {
    const found = await directorMovies(name, minVotes);
    if (!found) return { error: `Niemand gefunden für „${name}“.` };
    if (found.ids.length === 0) return { error: `${found.person}: keine passenden Filme ab 1980 gefunden.` };
    const r = await importMovieIds(found.ids.slice(0, 60), { stage, source: `Regie: ${found.person}` });
    revalidatePath("/", "layout");
    return { message: `${found.person}: ${summary(r)}. Filme im Katalog: ${await catalogMovieCount()}.` };
  } catch (e) {
    return { error: "Fehler beim Import: " + (e instanceof Error ? e.message : String(e)) };
  }
}

// Alle Serien aus dem Katalog entfernen (inkl. ihrer Bewertungen). Nur für Admins.
export async function removeAllSeries(): Promise<void> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return;
  await createAdminClient().from("titles").delete().eq("media_type", "tv");
  revalidatePath("/", "layout");
  revalidatePath("/admin");
}

// ---------------- Filmreihen ----------------

// Welche Filme (TMDB-IDs) sind schon im Katalog?
async function existingMovieIds(ids: number[]) {
  if (!ids.length) return new Set<number>();
  const { data } = await createAdminClient()
    .from("titles").select("tmdb_id").eq("media_type", "movie").in("tmdb_id", ids);
  return new Set((data ?? []).map((r) => r.tmdb_id as number));
}

async function markCollectionsChecked(list: { id: number; name: string }[]) {
  if (!list.length) return;
  await createAdminClient().from("collections").upsert(
    list.map((c) => ({ id: c.id, name: c.name, checked_at: new Date().toISOString() })),
  );
}

// Ergänzt fehlende Teile von Filmreihen, die schon im Katalog vertreten sind.
// Arbeitet pro Klick höchstens 10 Reihen ab, damit der Server nicht zu lange braucht.
export async function completeCollections(): Promise<FormState> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return { error: "Nur für Admins." };
  const admin = createAdminClient();

  const [{ data: inCatalog, error }, { data: checked }] = await Promise.all([
    admin.from("titles").select("collection_id,collection_name").not("collection_id", "is", null),
    admin.from("collections").select("id").not("checked_at", "is", null),
  ]);
  if (error) return { error: "Datenbank-Fehler: " + error.message + " (wurde die Ergänzung 3 im SQL Editor ausgeführt?)" };

  const done = new Set((checked ?? []).map((c) => c.id as number));
  const open = new Map<number, string>();
  for (const r of inCatalog ?? []) {
    const id = r.collection_id as number;
    if (!done.has(id)) open.set(id, r.collection_name as string);
  }
  if (open.size === 0) return { message: "Alle Filmreihen im Katalog sind vollständig. 👍" };

  const batch = [...open.entries()].slice(0, 10);
  let total = { ...EMPTY_RESULT };
  const processed: { id: number; name: string }[] = [];
  try {
    for (const [id, name] of batch) {
      const parts = await collectionParts(id);
      const have = await existingMovieIds(parts.ids);
      const missing = parts.ids.filter((x) => !have.has(x));
      if (missing.length) {
        const r = await importMovieIds(missing, { series: true });
        total = addResults(total, r);
      }
      processed.push({ id, name: parts.name || name });
    }
  } catch (e) {
    await markCollectionsChecked(processed);
    return { error: "Fehler: " + (e instanceof Error ? e.message : String(e)) };
  }
  await markCollectionsChecked(processed);
  revalidatePath("/", "layout");

  const rest = open.size - processed.length;
  return {
    message: `${processed.length} Reihen geprüft (${processed.map((p) => p.name).join(", ")}): ${summary(total)}. ` +
      (rest > 0 ? `Noch ${rest} Reihen offen – einfach nochmal klicken.` : "Alle Reihen sind jetzt vollständig."),
  };
}

// Franchise importieren: alle Filmreihen mit diesem Namen (+ optional Stichwort-Suche).
export async function importFranchise(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return { error: "Nur für Admins." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Bitte einen Namen eingeben." };
  const useKeyword = formData.get("useKeyword") === "on";
  const stage = formData.get("vorschau") === "on";
  const minVotes = Math.max(0, Number(formData.get("minVotes")) || 0);

  try {
    const collections = await searchCollections(name);
    const ids = new Set<number>();
    const names: string[] = [];
    for (const c of collections) {
      const parts = await collectionParts(c.id);
      parts.ids.forEach((x) => ids.add(x));
      names.push(parts.name);
    }
    let kwInfo = "";
    if (useKeyword) {
      const kw = await keywordMovies(name, minVotes);
      if (kw) {
        kw.ids.forEach((x) => ids.add(x));
        kwInfo = ` + Stichwort „${kw.keyword}“ (${kw.ids.length} Filme)`;
      } else {
        kwInfo = " (kein passendes Stichwort gefunden)";
      }
    }
    if (ids.size === 0) return { error: `Nichts gefunden für „${name}“.` };

    const have = await existingMovieIds([...ids]);
    const missing = [...ids].filter((x) => !have.has(x)).slice(0, 70);
    const r = missing.length ? await importMovieIds(missing, { series: true, stage, source: `Franchise: ${name}` }) : EMPTY_RESULT;
    await markCollectionsChecked(collections.map((c, i) => ({ id: c.id, name: names[i] ?? c.name })));
    revalidatePath("/", "layout");

    const found = names.length ? `Reihen: ${names.join(", ")}` : "Keine Filmreihe gefunden";
    return {
      message: `${found}${kwInfo}. ${have.size} waren schon im Katalog, ${summary(r)}. Filme im Katalog: ${await catalogMovieCount()}.`,
    };
  } catch (e) {
    return { error: "Fehler beim Import: " + (e instanceof Error ? e.message : String(e)) };
  }
}

// Filme neu von TMDB laden, denen Daten fehlen (Regie, Studios, Reihe, Qualitätsdaten …).
// Arbeitet in Etappen à 60 Filme; die Seite ruft so lange auf, bis nichts mehr fehlt.
export async function refreshChunk(): Promise<{ done: number; remaining: number }> {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("titles").select("id,tmdb_id,media_type", { count: "exact" }).or("vote_count.is.null,keywords.is.null").limit(60);
  if (error) throw new Error(error.message + " (wurden die Ergänzungen 9 und 11 im SQL Editor ausgeführt?)");
  if (!data?.length) return { done: 0, remaining: 0 };

  const results = await mapLimit(data, 8, (t) => fetchTitleRow(t.media_type as MediaType, t.tmdb_id as number));
  const rows = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  // Filme, die TMDB nicht mehr kennt: auf 0 Stimmen setzen, damit sie nicht endlos wiederkommen
  const failedIds = data.filter((_, k) => results[k].status !== "fulfilled").map((t) => t.id as number);
  if (rows.length) {
    const up = await admin.from("titles").upsert(rows, { onConflict: "media_type,tmdb_id" });
    if (up.error) throw new Error(up.error.message);
  }
  if (failedIds.length) await admin.from("titles").update({ vote_count: 0, keywords: [] }).in("id", failedIds);
  return { done: data.length, remaining: Math.max(0, (count ?? 0) - data.length) };
}

// ---------------- Verdachtsfälle ----------------

// Verdacht = (hat Bewertung UND (schwach bewertet ODER kaum bekannt)) ODER ausgeschlossene Herkunft
function suspectOr(minRating: number, minVotes: number) {
  return [
    `and(vote_count.not.is.null,or(vote_average.lt.${Number(minRating)},vote_count.lt.${Math.round(Number(minVotes))}))`,
    ...originOrFilterParts(),
  ].join(",");
}

export type Suspect = {
  id: number; title: string; release_year: number | null; poster_path: string | null; genres: string[];
  vote_average: number | null; vote_count: number | null; reasons: string[]; origin?: boolean;
};

// Filme, die womöglich nicht in den Katalog gehören: schwach bewertet oder kaum bekannt.
// Nie dabei: Preisträger und Filme, die beim Aussortieren schon behalten wurden.
export async function getSuspects(minRating: number, minVotes: number): Promise<{ list: Suspect[]; missing: number }> {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  const admin = createAdminClient();
  const [{ data, error }, { count: missing }] = await Promise.all([
    admin
      .from("titles")
      .select("id,title,release_year,poster_path,genres,vote_average,vote_count,original_language,countries")
      .is("kept_at", null)
      .eq("oscars", "{}")
      .eq("globes", "{}")
      .or(suspectOr(minRating, minVotes))
      .order("vote_average", { ascending: true, nullsFirst: false })
      .limit(500),
    admin.from("titles").select("id", { count: "exact", head: true }).is("vote_count", null),
  ]);
  if (error) throw new Error(error.message + " (wurde die Ergänzung 9 im SQL Editor ausgeführt?)");
  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const list = (data ?? []).map((t) => {
    const reasons: string[] = [];
    const origin = excludedOrigin({ original_language: t.original_language as string | null, countries: t.countries as string[] | null });
    if (origin) reasons.push(origin);
    const avg = t.vote_average as number | null;
    const cnt = t.vote_count as number | null;
    if (avg != null && avg < minRating) reasons.push(`Schwach bewertet: ${fmt(avg)}`);
    if (cnt != null && cnt < minVotes) reasons.push(`Kaum bekannt: ${cnt.toLocaleString("de-DE")} Stimmen`);
    return { ...(t as Omit<Suspect, "reasons">), reasons, origin: !!origin };
  });
  // Herkunft zuerst, dann schwächste Bewertung
  list.sort((a, b) => Number(b.origin) - Number(a.origin));
  return { list, missing: missing ?? 0 };
}

// ---------------- IMDb-Import ----------------

export type ImdbItem = { imdbId: string; rating: number | null };
export type ImdbChunkResult = { added: number; rated: number; kept: number; notFound: string[]; blocked: number };

// Verarbeitet einen Teil (max. 40 Einträge) einer IMDb-Bewertungsdatei:
// Film in den Katalog holen (falls nötig) und deine Bewertung übernehmen.
export async function importImdbChunk(items: ImdbItem[]): Promise<ImdbChunkResult> {
  const user = await getUser();
  if (!user) throw new Error("Nicht angemeldet");
  const list = items
    .filter((i) => /^tt\d+$/.test(i.imdbId))
    .slice(0, 40);
  const admin = createAdminClient();
  const supabase = await createClient();

  // 1) Welche Filme kennen wir schon (über die IMDb-ID)?
  const { data: known, error } = await admin
    .from("titles").select("id,imdb_id").in("imdb_id", list.map((i) => i.imdbId));
  if (error) throw new Error(error.message + " (wurde die Ergänzung 4 im SQL Editor ausgeführt?)");
  const idByImdb = new Map((known ?? []).map((r) => [r.imdb_id as string, r.id as number]));

  // 2) Unbekannte Filme bei TMDB nachschlagen und in den Katalog schreiben
  const unknown = list.filter((i) => !idByImdb.has(i.imdbId));
  const notFound: string[] = [];
  let added = 0;
  // TMDB-IDs nachschlagen und aussortierte (gesperrte) Filme überspringen
  const resolved = await mapLimit(unknown, 8, (i) => tmdbIdFromImdb(i.imdbId));
  const tmdbIds = resolved.map((r) => (r.status === "fulfilled" ? r.value : null));
  const candidateIds = tmdbIds.filter((x): x is number => !!x);
  const { data: blockedRows } = candidateIds.length
    ? await admin.from("excluded_titles").select("tmdb_id").eq("media_type", "movie").in("tmdb_id", candidateIds)
    : { data: [] };
  const blockedSet = new Set((blockedRows ?? []).map((b) => b.tmdb_id as number));
  let blocked = 0;
  const looked = await mapLimit(unknown.map((i, k) => ({ i, tmdbId: tmdbIds[k] })), 8, async ({ i, tmdbId }) => {
    if (!tmdbId) return null;
    if (blockedSet.has(tmdbId)) { blocked++; return "blocked" as const; }
    const row = await fetchTitleRow("movie", tmdbId);
    return { ...row, imdb_id: i.imdbId };
  });
  const rows: (Awaited<ReturnType<typeof fetchTitleRow>> & { imdb_id: string })[] = [];
  for (let k = 0; k < looked.length; k++) {
    const r = looked[k];
    if (r.status === "fulfilled" && r.value === "blocked") continue;
    if (r.status === "fulfilled" && r.value && r.value !== "blocked") rows.push(r.value);
    else notFound.push(unknown[k].imdbId);
  }
  if (rows.length) {
    const { data: saved, error: e2 } = await admin
      .from("titles").upsert(rows, { onConflict: "media_type,tmdb_id" }).select("id,imdb_id");
    if (e2) throw new Error(e2.message);
    for (const s of saved ?? []) idByImdb.set(s.imdb_id as string, s.id as number);
    added = rows.length;
  }

  // 3) Bewertungen übernehmen – vorhandene Bewertungen in der App bleiben unangetastet
  const titleIds = list.map((i) => idByImdb.get(i.imdbId)).filter((x): x is number => !!x);
  const { data: existing } = await supabase
    .from("user_title_feedback").select("title_id,rating").eq("user_id", user.id).in("title_id", titleIds);
  const hasRating = new Set((existing ?? []).filter((e) => e.rating != null).map((e) => e.title_id as number));

  const now = new Date().toISOString();
  const feedback = list.flatMap((i) => {
    const tid = idByImdb.get(i.imdbId);
    if (!tid || hasRating.has(tid)) return [];
    const rating = i.rating && i.rating >= 1 && i.rating <= 10 ? Math.round(i.rating) : null;
    return [{ user_id: user.id, title_id: tid, status: "gesehen", rating, reason: "IMDb-Import", updated_at: now }];
  });
  if (feedback.length) {
    const { error: e3 } = await supabase.from("user_title_feedback").upsert(feedback);
    if (e3) throw new Error(e3.message);
  }

  return { added, rated: feedback.length, kept: hasRating.size, notFound, blocked };
}

export async function finishImdbImport() {
  revalidatePath("/", "layout");
  revalidatePath("/bibliothek");
}

// ---------------- Oscar & Golden Globe ----------------

export type AwardsChunkResult = { next: number | null; total: number; ok: number; netflix: number; failed: number; updated: number };

// Verarbeitet einen Teil der Preisträger-Liste (40 Filme pro Aufruf). Nur für Admins.
export async function importAwardsChunk(offset: number, includeShorts: boolean): Promise<AwardsChunkResult> {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  const list = AWARD_FILMS.filter((a) => includeShorts || !isShortOnly(a));
  const chunk = list.slice(offset, offset + 40);
  const admin = createAdminClient();

  const ids = chunk.map((a) => a.tmdb);
  const have = await existingMovieIds(ids);

  // Schon vorhandene Filme: nur die Preise nachtragen
  const existing = chunk.filter((a) => have.has(a.tmdb));
  await mapLimit(existing, 8, async (a) => {
    const { error } = await admin.from("titles").update({ oscars: a.oscars, globes: a.globes })
      .eq("media_type", "movie").eq("tmdb_id", a.tmdb);
    if (error) throw new Error(error.message);
  });

  // Neue Filme holen (Netflix wird aussortiert, Studio-Filter gilt hier nicht)
  const missing = ids.filter((x) => !have.has(x));
  const r = missing.length ? await importMovieIds(missing) : EMPTY_RESULT;

  const next = offset + chunk.length;
  return {
    next: next < list.length ? next : null,
    total: list.length,
    ok: r.ok, netflix: r.netflix, failed: r.failed, updated: existing.length,
  };
}

// Filme einer Schauspielerin / eines Schauspielers importieren. Nur für Admins.
export async function importActor(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return { error: "Nur für Admins." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Bitte einen Namen eingeben." };
  const minVotes = Math.max(0, Number(formData.get("minVotes")) || 0);
  const onlyLead = formData.get("onlyLead") === "on";
  const stage = formData.get("vorschau") === "on";

  try {
    const found = await actorMovies(name, minVotes, onlyLead);
    if (!found) return { error: `Niemand gefunden für „${name}“.` };
    if (found.ids.length === 0) return { error: `${found.person}: keine passenden Filme ab 1980 gefunden.` };
    const have = await existingMovieIds(found.ids);
    const missing = found.ids.filter((x) => !have.has(x)).slice(0, 60);
    const r = missing.length ? await importMovieIds(missing, { stage, source: `Schauspiel: ${found.person}` }) : EMPTY_RESULT;
    revalidatePath("/", "layout");
    return {
      message: `${found.person}: ${found.ids.length} passende Filme, ${have.size} waren schon im Katalog, ${summary(r)}. Filme im Katalog: ${await catalogMovieCount()}.`,
    };
  } catch (e) {
    return { error: "Fehler beim Import: " + (e instanceof Error ? e.message : String(e)) };
  }
}

// ---------------- Katalog verwalten ----------------

// Entfernt Titel aus dem Katalog (inkl. aller Bewertungen dazu). Nur für Admins.
// block = auf die Sperrliste setzen, damit Importe sie nicht wieder hinzufügen.
export async function deleteTitles(ids: number[], block: boolean): Promise<{ deleted: number }> {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  const admin = createAdminClient();
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    if (block) {
      const { data } = await admin.from("titles").select("media_type,tmdb_id,title").in("id", part);
      if (data?.length) {
        const { error } = await admin.from("excluded_titles").upsert(data, { onConflict: "media_type,tmdb_id" });
        if (error) throw new Error(error.message + " (wurde die Ergänzung 7 im SQL Editor ausgeführt?)");
      }
    }
    const { error, count } = await admin.from("titles").delete({ count: "exact" }).in("id", part);
    if (error) throw new Error(error.message);
    deleted += count ?? 0;
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin");
  return { deleted };
}

// Sperrliste leeren (entfernte Filme dürfen wieder importiert werden).
export async function clearBlocklist(): Promise<void> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return;
  await createAdminClient().from("excluded_titles").delete().neq("tmdb_id", -1);
  revalidatePath("/admin");
}

// ---------------- Aussortieren (Tinder-Stil) ----------------

export type CurationFilter = {
  genre?: string; decade?: number; order?: "unbekannt" | "schwach" | "zufall" | "neu";
  // Nur Verdachtsfälle: Bewertung unter minRating ODER weniger Stimmen als minVotes
  minRating?: number; minVotes?: number;
};
export type CurationCard = {
  id: number; tmdb_id: number; media_type: string; title: string; release_year: number | null; genres: string[];
  directors: string[] | null; cast_names: string[] | null; overview: string | null; poster_path: string | null;
  popularity: number | null; runtime_seconds: number | null; oscars: string[] | null; globes: string[] | null;
  vote_average: number | null; vote_count: number | null;
  original_language: string | null; countries: string[] | null;
  source?: string | null; // nur bei Import-Kandidaten
};

const CURATION_COLS =
  "id,tmdb_id,media_type,title,release_year,genres,directors,cast_names,overview,poster_path,popularity,runtime_seconds,oscars,globes,vote_average,vote_count,original_language,countries";

// Nächster Stapel noch nicht geprüfter Titel (max. 30).
export async function getCurationBatch(f: CurationFilter, skip: number[]): Promise<{ cards: CurationCard[]; remaining: number }> {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  const admin = createAdminClient();

  const base = () => {
    let q = admin.from("titles").select(CURATION_COLS, { count: "exact" }).is("kept_at", null);
    if (f.genre) q = q.contains("genres", [f.genre]);
    if (f.decade) q = q.gte("release_year", f.decade).lt("release_year", f.decade + 10);
    // Preisgekrönte Filme werden beim Aussortieren grundsätzlich nicht gezeigt
    q = q.eq("oscars", "{}").eq("globes", "{}");
    if (f.minRating != null && f.minVotes != null) {
      q = q.or(suspectOr(f.minRating, f.minVotes));
    }
    if (skip.length) q = q.not("id", "in", `(${skip.slice(-300).join(",")})`);
    return q;
  };

  let q = base();
  if (f.order === "neu") q = q.order("created_at", { ascending: false });
  else if (f.order === "schwach") q = q.order("vote_average", { ascending: true, nullsFirst: false });
  else if (f.order === "zufall") q = q.order("tmdb_id", { ascending: Math.random() < 0.5 });
  else q = q.order("popularity", { ascending: true, nullsFirst: true });
  const { data, error, count } = await q.limit(f.order === "zufall" ? 120 : 30);
  if (error) throw new Error(error.message + " (wurde die Ergänzung 8 im SQL Editor ausgeführt?)");

  let cards = (data ?? []) as CurationCard[];
  if (f.order === "zufall") cards = cards.sort(() => Math.random() - 0.5).slice(0, 30);
  return { cards, remaining: count ?? cards.length };
}

export async function keepTitle(id: number, keep: boolean) {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  const { error } = await createAdminClient()
    .from("titles").update({ kept_at: keep ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw new Error(error.message);
}

// Entfernen + sperren. Gibt zurück, was man für "Rückgängig" braucht.
export async function removeForCuration(id: number) {
  const { data } = await createAdminClient().from("titles").select("oscars,globes").eq("id", id).maybeSingle();
  if (data && ((data.oscars as string[])?.length || (data.globes as string[])?.length))
    throw new Error("Preisgekrönte Filme können derzeit nicht aussortiert werden.");
  await deleteTitles([id], true);
}

// Rückgängig: von der Sperrliste nehmen und neu importieren.
export async function restoreTitle(mediaType: string, tmdbId: number) {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  const admin = createAdminClient();
  await admin.from("excluded_titles").delete().eq("media_type", mediaType).eq("tmdb_id", tmdbId);
  if (mediaType === "movie") await importMovieIds([tmdbId], { gate: false });
  else {
    const row = await fetchTitleRow("tv", tmdbId);
    await admin.from("titles").upsert(row, { onConflict: "media_type,tmdb_id" });
  }
  revalidatePath("/admin");
}

// Alle "behalten"-Markierungen zurücksetzen (nochmal von vorn prüfen).
export async function resetCuration(): Promise<void> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return;
  await createAdminClient().from("titles").update({ kept_at: null }).not("kept_at", "is", null);
  revalidatePath("/admin");
}

// Einzelnen Film von der Sperrliste nehmen (optional gleich wieder in den Katalog holen).
export async function unblockTitle(mediaType: string, tmdbId: number, readd: boolean): Promise<void> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return;
  if (readd) await restoreTitle(mediaType, tmdbId);
  else await createAdminClient().from("excluded_titles").delete().eq("media_type", mediaType).eq("tmdb_id", tmdbId);
  revalidatePath("/admin");
}
