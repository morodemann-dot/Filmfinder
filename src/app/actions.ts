"use server";

// "Server-Aktionen": Funktionen, die auf dem Server laufen, wenn man in der App
// einen Knopf drückt. Geheime Schlüssel bleiben so immer auf dem Server.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient, getUser, isAdmin } from "@/lib/supabase/server";
import {
  DECADES,
  IMPORT_LISTS,
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
  const rows = [];
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
