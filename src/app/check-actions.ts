"use server";

// "Geschmacks-Check" für alle Nutzer: 10 Filme, die du noch nicht kennst – „Reizt mich“ oder „Eher nicht“.
// Die Antworten landen in derselben Tabelle wie das Modell-Duell (ai_duel, Kennzeichen "check") und
// fließen genauso ins Profil ein (Verbesserung 7). So lernt die App auch ohne viele Bewertungen schnell.
import { createAdminClient, createClient, getUser } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { loadSnoozed, loadTasteData } from "@/lib/tasteData";
import { tuneOptions } from "@/lib/evaluate";
import {
  APP_SETTINGS, buildProfile, duelEntries, franchiseOf, pickDiverse, recommend, SUGGEST_FROM_YEAR,
} from "@/lib/recommend";
import { formatRuntime } from "@/lib/types";
import type { DuelCard } from "./ki-actions";
import { saveFeedbackQuiet } from "./actions";

const ROUND = 10;
type Row = { title_id: number; picked_by: string[]; answer: string | null };

async function me() {
  const user = await getUser();
  if (!user) throw new Error("Bitte erst anmelden.");
  return user;
}
async function myRows(userId: string) {
  return fetchAll<Row>((from, to) =>
    createAdminClient().from("ai_duel").select("title_id,picked_by,answer").eq("user_id", userId).range(from, to));
}

// Stand: wie viele Antworten gibt es schon, und liegen noch offene Karten bereit?
export async function checkStatus(): Promise<{ answered: number; open: number } | null> {
  try {
    const user = await me();
    const rows = await myRows(user.id);
    return {
      answered: rows.filter((r) => r.answer === "passt" || r.answer === "passt_nicht").length,
      open: rows.filter((r) => !r.answer && r.picked_by.includes("check")).length,
    };
  } catch {
    return null; // Tabelle fehlt (Ergänzung 14) o. Ä.
  }
}

// Neue Runde: 6 Filme, die laut App gut passen (bestätigen oder widerlegen),
// 4 aus der Mitte (dort lernt die App am meisten, wo die Grenze verläuft). Alles abwechslungsreich.
export async function checkStart(): Promise<{ cards: number; error?: string }> {
  try {
    const user = await me();
    const supabase = await createClient();
    const [{ rated, catalog }, rows, snoozed] = await Promise.all([loadTasteData(supabase, user.id), myRows(user.id), loadSnoozed(supabase, user.id)]);
    const open = rows.filter((r) => !r.answer && r.picked_by.includes("check"));
    if (open.length >= ROUND) return { cards: open.length };

    const byId = new Map(catalog.map((t) => [t.id, t]));
    const answers = new Map(rows.filter((r) => r.answer === "passt" || r.answer === "passt_nicht").map((r) => [r.title_id, r.answer === "passt"] as [number, boolean]));
    const skip = new Set([...rated.map((r) => r.id), ...rows.map((r) => r.title_id), ...snoozed]);
    const known = new Set(rated.filter((r) => r.status === "gesehen" || r.status === "nicht_interessiert").map(franchiseOf).filter(Boolean));
    const pool = catalog.filter((t) => !skip.has(t.id) && (t.release_year ?? 0) >= SUGGEST_FROM_YEAR && (t.vote_count ?? 0) >= 300 && !known.has(franchiseOf(t)));
    if (!pool.length) return { cards: 0 };

    const opts = { ...tuneOptions(rated).opts, ...APP_SETTINGS };
    const recs = recommend(pool, buildProfile([...rated, ...duelEntries(answers, byId)], opts, catalog), opts);
    const need = ROUND - open.length;
    const top = pickDiverse(recs, Math.ceil(need * 0.6));
    const taken = new Set(top.map((r) => r.title.id));
    const middle = recs.slice(Math.floor(recs.length * 0.15), Math.floor(recs.length * 0.5)).filter((r) => !taken.has(r.title.id));
    for (let i = middle.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [middle[i], middle[j]] = [middle[j], middle[i]]; }
    // Gekennzeichnet, damit sich später messen lässt, wie gut die Top-Vorschläge passen
    const rowsNew = [
      ...top.map((r) => ({ user_id: user.id, title_id: r.title.id, picked_by: ["check", "check-top"] })),
      ...pickDiverse(middle, need - top.length).map((r) => ({ user_id: user.id, title_id: r.title.id, picked_by: ["check", "check-mid"] })),
    ];

    const { error } = await createAdminClient().from("ai_duel")
      .upsert(rowsNew, { onConflict: "user_id,title_id", ignoreDuplicates: true });
    if (error) return { cards: 0, error: error.message };
    return { cards: open.length + rowsNew.length };
  } catch (e) {
    return { cards: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkCards(): Promise<DuelCard[]> {
  const user = await me();
  const rows = (await myRows(user.id)).filter((r) => !r.answer && r.picked_by.includes("check"));
  if (!rows.length) return [];
  const { data } = await createAdminClient().from("titles")
    .select("id,title,poster_path,release_year,runtime_seconds,genres").in("id", rows.map((r) => r.title_id));
  const mix = (id: number) => ((id * 2654435761) >>> 0) % 1000; // gemischt, damit "passt gut" nicht vorne steht
  return (data ?? []).map((t) => ({
    id: t.id as number,
    title: t.title as string,
    poster_path: t.poster_path as string | null,
    meta: [t.release_year, formatRuntime(t.runtime_seconds as number | null), (t.genres as string[]).slice(0, 2).join(", ")].filter(Boolean).join(" · "),
  })).sort((a, b) => mix(a.id) - mix(b.id));
}

export async function checkAnswer(titleId: number, answer: "passt" | "passt_nicht" | "gesehen" | null) {
  const user = await me();
  // "Kenne ich schon" = gesehen (ohne Punkte) → taucht in Vorschlägen nicht mehr auf; Rückgängig nimmt das wieder raus
  const { data: before } = await createAdminClient().from("ai_duel").select("answer").eq("user_id", user.id).eq("title_id", titleId).maybeSingle();
  if (answer === "gesehen") await saveFeedbackQuiet(titleId, "gesehen", null);
  else if (before?.answer === "gesehen") await saveFeedbackQuiet(titleId, null, null);
  const { error } = await createAdminClient().from("ai_duel")
    .update({ answer, answered_at: answer ? new Date().toISOString() : null })
    .eq("user_id", user.id).eq("title_id", titleId);
  if (error) throw new Error(error.message);
}
