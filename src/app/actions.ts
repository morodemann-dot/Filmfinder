"use server";

// "Server-Aktionen": Funktionen, die auf dem Server laufen, wenn man in der App
// einen Knopf drückt. Geheime Schlüssel bleiben so immer auf dem Server.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient, getUser, isAdmin } from "@/lib/supabase/server";
import {
  DECADES,
  IMPORT_LISTS,
  collectionParts,
  keywordMovies,
  searchCollections,
  tmdbIdFromImdb,
  directorMovies,
  discoverHollywood,
  fetchListIds,
  fetchTitleRow,
  hasMajorStudio,
  isNetflix,
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
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Speichern fehlgeschlagen");
  }
  revalidatePath("/bibliothek");
  revalidatePath(`/titel/${titleId}`);
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
  revalidatePath("/");
  return {
    message: `${ok} Titel importiert/aktualisiert${failed ? `, ${failed} fehlgeschlagen` : ""}. Katalog jetzt: ${count ?? "?"} Titel. Nächste Startseite: ${from + pages}.`,
  };
}

// Holt Details zu vielen Filmen, sortiert Netflix (und optional kleine Studios) aus und speichert.
async function importMovieIds(ids: number[], onlyMajor: boolean) {
  const admin = createAdminClient();
  const results = await mapLimit(ids, 8, (id) => fetchTitleRow("movie", id));
  let failed = 0, netflix = 0, small = 0;
  const rows: Awaited<ReturnType<typeof fetchTitleRow>>[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") { failed++; continue; }
    if (isNetflix(r.value.studios)) { netflix++; continue; }
    if (onlyMajor && !hasMajorStudio(r.value.studios)) { small++; continue; }
    rows.push(r.value);
  }
  if (rows.length) {
    const { error } = await admin.from("titles").upsert(rows, { onConflict: "media_type,tmdb_id" });
    if (error) throw new Error(error.message);
  }
  return { ok: rows.length, failed, netflix, small };
}

async function catalogMovieCount() {
  const { count } = await createAdminClient()
    .from("titles").select("id", { count: "exact", head: true }).eq("media_type", "movie");
  return count ?? 0;
}

function summary(s: { ok: number; failed: number; netflix: number; small: number }) {
  const parts = [`${s.ok} Filme übernommen`];
  if (s.netflix) parts.push(`${s.netflix} Netflix-Filme aussortiert`);
  if (s.small) parts.push(`${s.small} ohne großes Studio aussortiert`);
  if (s.failed) parts.push(`${s.failed} fehlgeschlagen`);
  return parts.join(", ");
}

// Hollywood-Filme eines Jahrzehnts importieren. Nur für Admins.
export async function importHollywood(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return { error: "Nur für Admins." };

  const decade = String(formData.get("decade")) as DecadeKey;
  if (!(decade in DECADES)) return { error: "Unbekanntes Jahrzehnt." };
  const minVotes = Math.max(0, Number(formData.get("minVotes")) || 0);
  const onlyMajor = formData.get("onlyMajor") === "on";
  const from = Math.max(1, Number(formData.get("from")) || 1);
  const pages = Math.min(5, Math.max(1, Number(formData.get("pages")) || 1));

  const total = { ok: 0, failed: 0, netflix: 0, small: 0 };
  let lastPage = from - 1;
  let totalPages = 0;
  try {
    for (let p = from; p < from + pages; p++) {
      const d = await discoverHollywood(decade, minVotes, p);
      totalPages = d.totalPages;
      if (p > d.totalPages || d.ids.length === 0) break;
      const r = await importMovieIds(d.ids, onlyMajor);
      total.ok += r.ok; total.failed += r.failed; total.netflix += r.netflix; total.small += r.small;
      lastPage = p;
    }
  } catch (e) {
    return { error: "Fehler beim Import: " + (e instanceof Error ? e.message : String(e)) };
  }

  revalidatePath("/");
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

  try {
    const found = await directorMovies(name, minVotes);
    if (!found) return { error: `Niemand gefunden für „${name}“.` };
    if (found.ids.length === 0) return { error: `${found.person}: keine passenden Filme ab 1980 gefunden.` };
    const r = await importMovieIds(found.ids.slice(0, 60), false);
    revalidatePath("/");
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
  revalidatePath("/");
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
  const total = { ok: 0, failed: 0, netflix: 0, small: 0 };
  const processed: { id: number; name: string }[] = [];
  try {
    for (const [id, name] of batch) {
      const parts = await collectionParts(id);
      const have = await existingMovieIds(parts.ids);
      const missing = parts.ids.filter((x) => !have.has(x));
      if (missing.length) {
        const r = await importMovieIds(missing, false);
        total.ok += r.ok; total.failed += r.failed; total.netflix += r.netflix;
      }
      processed.push({ id, name: parts.name || name });
    }
  } catch (e) {
    await markCollectionsChecked(processed);
    return { error: "Fehler: " + (e instanceof Error ? e.message : String(e)) };
  }
  await markCollectionsChecked(processed);
  revalidatePath("/");

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
    const r = missing.length ? await importMovieIds(missing, false) : { ok: 0, failed: 0, netflix: 0, small: 0 };
    await markCollectionsChecked(collections.map((c, i) => ({ id: c.id, name: names[i] ?? c.name })));
    revalidatePath("/");

    const found = names.length ? `Reihen: ${names.join(", ")}` : "Keine Filmreihe gefunden";
    return {
      message: `${found}${kwInfo}. ${have.size} waren schon im Katalog, ${summary(r)}. Filme im Katalog: ${await catalogMovieCount()}.`,
    };
  } catch (e) {
    return { error: "Fehler beim Import: " + (e instanceof Error ? e.message : String(e)) };
  }
}

// Ältere Einträge (ohne Regie/Studio/Reihe) neu von TMDB laden. Netflix-Filme werden dabei entfernt.
export async function refreshOldMovies(): Promise<FormState> {
  const user = await getUser();
  if (!isAdmin(user?.email)) return { error: "Nur für Admins." };
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("titles").select("id,tmdb_id").eq("media_type", "movie").filter("studios", "eq", "{}").limit(60);
  if (error) return { error: "Datenbank-Fehler: " + error.message };
  if (!data?.length) return { message: "Alle Filme sind auf dem neuesten Stand. 👍" };

  const results = await mapLimit(data, 8, (t) => fetchTitleRow("movie", t.tmdb_id as number));
  const rows: Awaited<ReturnType<typeof fetchTitleRow>>[] = [];
  const netflixIds: number[] = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    if (isNetflix(r.value.studios)) netflixIds.push(data[i].id as number);
    else rows.push(r.value);
  });
  if (rows.length) {
    const up = await admin.from("titles").upsert(rows, { onConflict: "media_type,tmdb_id" });
    if (up.error) return { error: "Fehler beim Speichern: " + up.error.message };
  }
  if (netflixIds.length) await admin.from("titles").delete().in("id", netflixIds);
  revalidatePath("/");
  return {
    message: `${rows.length} Filme aufgefrischt${netflixIds.length ? `, ${netflixIds.length} Netflix-Filme entfernt` : ""}.` +
      (data.length === 60 ? " Es gibt noch mehr – einfach nochmal klicken." : ""),
  };
}

// ---------------- IMDb-Import ----------------

export type ImdbItem = { imdbId: string; rating: number | null };
export type ImdbChunkResult = { added: number; rated: number; kept: number; notFound: string[] };

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
  const looked = await mapLimit(unknown, 8, async (i) => {
    const tmdbId = await tmdbIdFromImdb(i.imdbId);
    if (!tmdbId) return null;
    const row = await fetchTitleRow("movie", tmdbId);
    return { ...row, imdb_id: i.imdbId };
  });
  const rows: (Awaited<ReturnType<typeof fetchTitleRow>> & { imdb_id: string })[] = [];
  for (let k = 0; k < looked.length; k++) {
    const r = looked[k];
    if (r.status === "fulfilled" && r.value) rows.push(r.value);
    else notFound.push(unknown[k].imdbId);
  }
  if (rows.length) {
    const { data: saved, error: e2 } = await admin
      .from("titles").upsert(rows, { onConflict: "media_type,tmdb_id" }).select("id,imdb_id");
    if (e2) throw new Error(e2.message);
    for (const s of saved ?? []) idByImdb.set(s.imdb_id as string, s.id as number);
    added = rows.length;
  }

  // 3) Bewertungen übernehmen – vorhandene Sterne-Bewertungen in der App bleiben unangetastet
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

  return { added, rated: feedback.length, kept: hasRating.size, notFound };
}

export async function finishImdbImport() {
  revalidatePath("/");
  revalidatePath("/bibliothek");
}
