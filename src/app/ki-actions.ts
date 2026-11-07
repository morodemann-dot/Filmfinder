"use server";

// Modell-Duell: Die App schlägt Filme vor – je Quelle (ohne KI, Haiku, Sonnet) –, du bewertest blind,
// ob sie zu dir passen. Die Antworten landen NICHT in deinem Geschmacksprofil, nur in der Tabelle ai_duel.

import { createAdminClient, createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { loadAiFeatures, loadTasteData } from "@/lib/tasteData";
import { MIN_FOR_TEST } from "@/lib/evaluate";
import { diversify, pickDiverse, SUGGEST_FROM_YEAR } from "@/lib/recommend";
import { formatRuntime } from "@/lib/types";
import { ALL_SOURCES, DUEL_MODELS, DUEL_SOURCES, rankWith } from "@/lib/duel";

async function requireAdminUser() {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  return user!;
}

const POOL_SIZE = 100;
const PICKS_PER_ROUND = 10;

type DuelRow = { title_id: number; picked_by: string[]; answer: string | null };

async function duelRows(userId: string) {
  return fetchAll<DuelRow>((from, to) =>
    createAdminClient().from("ai_duel").select("title_id,picked_by,answer").eq("user_id", userId).range(from, to),
  );
}

// 1) Testfilme auswählen: 50 Filme, die die neue App (mit Interesse) am höchsten einstuft, + 50 zufällige
//    solide Filme. Nur Filme ab 1990, die du noch nicht eingeordnet hast; max. 2 pro Filmreihe, 3 pro Regie.
export async function duelPreparePool(): Promise<{ added: number; error?: string }> {
  try {
    const user = await requireAdminUser();
    const supabase = await createClient();
    const [{ rated, catalog }, existing] = await Promise.all([loadTasteData(supabase, user.id), duelRows(user.id)]);
    const skip = new Set([...rated.map((r) => r.id), ...existing.map((r) => r.title_id)]);
    const free = catalog.filter((t) => !skip.has(t.id) && (t.release_year ?? 0) >= SUGGEST_FROM_YEAR);
    // Bereits vorhandene Testfilme zählen bei der Vielfalt mit
    const already = catalog.filter((t) => existing.some((r) => r.title_id === t.id));
    const top = diversify(rankWith(DUEL_SOURCES[0], rated, catalog, new Map(), free).map((r) => r.title), POOL_SIZE / 2, already);
    const rest = free.filter((t) => !top.includes(t) && (t.vote_count ?? 0) >= 500);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const ids = [...top, ...diversify(rest, POOL_SIZE - top.length, [...already, ...top])].map((t) => t.id);
    if (!ids.length) return { added: 0 };
    const { error } = await createAdminClient().from("ai_duel").insert(ids.map((title_id) => ({ user_id: user.id, title_id })));
    if (error) return { added: 0, error: error.message + " (wurde die Ergänzung 14 im SQL Editor ausgeführt?)" };
    return { added: ids.length };
  } catch (e) {
    return { added: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// 2) Neue Runde: jede Variante wählt ihre 10 besten noch offenen Testfilme (ab 1990, abwechslungsreich;
//    fair: nur Filme, die alle beteiligten KI-Modelle eingeschätzt haben).
export async function duelStartRound(): Promise<{ cards: number; sources: string[]; error?: string }> {
  try {
    const user = await requireAdminUser();
    const supabase = await createClient();
    const [{ rated, catalog }, rows, ai] = await Promise.all([loadTasteData(supabase, user.id), duelRows(user.id), loadAiFeatures(supabase)]);
    const open = rows.filter((r) => !r.answer).map((r) => r.title_id);
    if (!open.length) return { cards: 0, sources: [] };
    const { data: films } = await supabase.from("titles").select("*").in("id", open);
    const pool = ((films ?? []) as import("@/lib/types").Title[]).filter((t) => (t.release_year ?? 0) >= SUGGEST_FROM_YEAR);

    const models = DUEL_MODELS.filter((m) => {
      const map = ai.get(m);
      const ratedCovered = map ? rated.filter((r) => r.rating && map.has(r.id)).length : 0;
      const poolCovered = map ? pool.filter((t) => map.has(t.id)).length : 0;
      return ratedCovered >= MIN_FOR_TEST && poolCovered >= pool.length * 0.8;
    });
    const fair = pool.filter((t) => models.every((m) => ai.get(m)!.has(t.id)));
    const active = DUEL_SOURCES.filter((s) => !s.model || models.includes(s.model));
    const sources = active.map((s) => s.key);

    const picks = new Map<number, Set<string>>();
    for (const src of active) {
      // Abwechslung: weitere Filme derselben Reihe/Regie bekommen einen kleinen Abzug
      const best = pickDiverse(rankWith(src, rated, catalog, ai, fair), PICKS_PER_ROUND);
      for (const { title: t } of best) {
        if (!picks.has(t.id)) picks.set(t.id, new Set());
        picks.get(t.id)!.add(src.key);
      }
    }
    const admin = createAdminClient();
    await admin.from("ai_duel").update({ picked_by: [] }).eq("user_id", user.id).is("answer", null);
    for (const [title_id, srcs] of picks) {
      await admin.from("ai_duel").update({ picked_by: [...srcs] }).eq("user_id", user.id).eq("title_id", title_id);
    }
    return { cards: picks.size, sources };
  } catch (e) {
    return { cards: 0, sources: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export type DuelCard = { id: number; title: string; poster_path: string | null; meta: string };

// 3) Karten der aktuellen Runde (gemischt, ohne Hinweis auf die Quelle)
export async function duelCards(): Promise<DuelCard[]> {
  const user = await requireAdminUser();
  const rows = (await duelRows(user.id)).filter((r) => !r.answer && r.picked_by.length);
  if (!rows.length) return [];
  const { data } = await createAdminClient().from("titles")
    .select("id,title,poster_path,release_year,runtime_seconds,genres").in("id", rows.map((r) => r.title_id));
  const mix = (id: number) => ((id * 2654435761) >>> 0) % 1000;
  return (data ?? [])
    .map((t) => ({
      id: t.id as number,
      title: t.title as string,
      poster_path: t.poster_path as string | null,
      meta: [t.release_year, formatRuntime(t.runtime_seconds as number | null), (t.genres as string[]).slice(0, 2).join(", ")].filter(Boolean).join(" · "),
    }))
    .sort((a, b) => mix(a.id) - mix(b.id));
}

export async function duelAnswer(titleId: number, answer: "passt" | "passt_nicht" | "gesehen" | null) {
  const user = await requireAdminUser();
  const { error } = await createAdminClient().from("ai_duel")
    .update({ answer, answered_at: answer ? new Date().toISOString() : null })
    .eq("user_id", user.id).eq("title_id", titleId);
  if (error) throw new Error(error.message);
}

export type DuelResult = { source: string; name: string; passt: number; nicht: number; gesehen: number; offen: number };

// Beantwortete Testfilme (für den nachträglichen Test)
export async function duelAnswers(): Promise<Map<number, boolean>> {
  const user = await requireAdminUser();
  const rows = await duelRows(user.id).catch(() => []);
  return new Map(rows.filter((r) => r.answer === "passt" || r.answer === "passt_nicht").map((r) => [r.title_id, r.answer === "passt"]));
}

// 4) Auswertung: Wie viele Vorschläge jeder Quelle haben gepasst?
export async function duelResults(): Promise<{ pool: number; answered: number; results: DuelResult[] } | null> {
  const user = await requireAdminUser();
  const rows = await duelRows(user.id).catch(() => null);
  if (!rows) return null;
  const results = ALL_SOURCES.map(({ key: source, name }) => {
    const mine = rows.filter((r) => r.picked_by.includes(source));
    return {
      source,
      name,
      passt: mine.filter((r) => r.answer === "passt").length,
      nicht: mine.filter((r) => r.answer === "passt_nicht").length,
      gesehen: mine.filter((r) => r.answer === "gesehen").length,
      offen: mine.filter((r) => !r.answer).length,
    };
  }).filter((r) => r.passt + r.nicht + r.gesehen + r.offen > 0);
  return { pool: rows.length, answered: rows.filter((r) => r.answer).length, results };
}

// Alles zurücksetzen (Testfilme und Antworten; die KI-Einschätzungen bleiben gespeichert)
export async function duelReset() {
  const user = await requireAdminUser();
  await createAdminClient().from("ai_duel").delete().eq("user_id", user.id);
}
