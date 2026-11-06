"use server";

// "Server-Aktionen": Funktionen, die auf dem Server laufen, wenn man in der App
// einen Knopf drückt. Geheime Schlüssel bleiben so immer auf dem Server.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient, getUser, isAdmin } from "@/lib/supabase/server";
import {
  IMPORT_LISTS,
  fetchListIds,
  fetchTitleRow,
  mapLimit,
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

  if (!process.env.INVITE_CODE || code !== process.env.INVITE_CODE)
    return { error: "Der Einladungscode stimmt nicht." };
  if (password.length < 8) return { error: "Das Passwort braucht mindestens 8 Zeichen." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    return {
      error: error.message.includes("already")
        ? "Für diese E-Mail gibt es schon ein Konto."
        : "Konto konnte nicht angelegt werden.",
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
