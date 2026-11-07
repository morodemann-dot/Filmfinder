"use server";


// Modell-Duell: Die App schlägt Filme vor – je Quelle (ohne KI, Haiku, Sonnet) –, du bewertest blind,
// ob sie zu dir passen. Die Antworten landen NICHT in deinem Geschmacksprofil, nur in der Tabelle ai_duel.

import { createAdminClient, createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { loadAiFeatures, loadTasteData } from "@/lib/tasteData";
import { MIN_FOR_TEST } from "@/lib/evaluate";
import { diversify, duelEntries, franchiseOf, pickDiverse, SUGGEST_FROM_YEAR } from "@/lib/recommend";
import { formatRuntime } from "@/lib/types";
import { ALL_SOURCES, DUEL_MODELS, DUEL_SOURCES, rankWith } from "@/lib/duel";

async function requireAdminUser() {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  return user!;
}

const POOL_SIZE = 100;
const PICKS_PER_ROUND = 10;

type DuelRow = { title_id: number; picked_by: string[]; answer: string | null; answered_at: string | null };

// Gegenproben: Karten, bei denen die neue App "passt nicht" (bzw. "unentschieden") vorhersagt
const PROBES = [
  { key: "probe-neg", name: "Gegenprobe: App sagt „passt nicht“" },
  { key: "probe-mid", name: "Mitte: App ist unentschieden" },
];

async function duelRows(userId: string) {
  return fetchAll<DuelRow>((from, to) =>
    createAdminClient().from("ai_duel").select("title_id,picked_by,answer,answered_at").eq("user_id", userId).range(from, to),
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
    // Wie der echte Filmfinder (Modus Entdecken): aus dem ganzen Katalog – ungesehen, ab 1980, nicht schon im Duell
    // beantwortet, keine weiteren Teile von Reihen/Universen, die du kennst
    const answered = new Set(rows.filter((r) => r.answer).map((r) => r.title_id));
    const seen = new Set(rated.map((r) => r.id));
    const known = new Set(rated.filter((r) => r.status === "gesehen" || r.status === "nicht_interessiert").map(franchiseOf).filter(Boolean));
    const pool = catalog.filter((t) => !seen.has(t.id) && !answered.has(t.id) && (t.release_year ?? 0) >= SUGGEST_FROM_YEAR &&
      !known.has(franchiseOf(t)));
    if (!pool.length) return { cards: 0, sources: [] };

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
    // 7) bisherige Duell-Antworten als Lernstoff (nur Varianten mit duelWeight nutzen sie)
    const byIdAll = new Map(catalog.map((t) => [t.id, t]));
    const learnFromDuel = duelEntries(new Map(rows.filter((r) => r.answer === "passt" || r.answer === "passt_nicht")
      .map((r) => [r.title_id, r.answer === "passt"] as [number, boolean])), byIdAll);
    let mainRanked: ReturnType<typeof rankWith> = [];
    for (const src of active) {
      const ranked = rankWith(src, rated, catalog, ai, fair, learnFromDuel);
      if (src === active[0]) mainRanked = ranked;
      // Abwechslung: weitere Filme derselben Reihe/Regie bekommen einen kleinen Abzug
      const best = pickDiverse(ranked, PICKS_PER_ROUND);
      for (const { title: t } of best) {
        if (!picks.has(t.id)) picks.set(t.id, new Set());
        picks.get(t.id)!.add(src.key);
      }
    }
    // Gegenprobe: 3 Filme, die die neue App weit unten sieht (untere 15 %), und 2 aus der Mitte – nur
    // bekanntere Filme (ab 1.500 Stimmen), damit man sie einschätzen kann
    const judgeable = mainRanked.filter((r) => (r.title.vote_count ?? 0) >= 1500 && !picks.has(r.title.id));
    const n = judgeable.length;
    const draw = (list: typeof judgeable, k: number, key: string) => {
      const copy = [...list];
      for (let i = 0; i < k && copy.length; i++) {
        const [r] = copy.splice(Math.floor(Math.random() * copy.length), 1);
        picks.set(r.title.id, new Set([key]));
      }
    };
    if (n >= 40) {
      draw(judgeable.slice(Math.floor(n * 0.85)), 3, "probe-neg");
      draw(judgeable.slice(Math.floor(n * 0.45), Math.floor(n * 0.55)), 2, "probe-mid");
    }

    const admin = createAdminClient();
    // alles in zwei Schritten speichern (statt jeden Film einzeln)
    await admin.from("ai_duel").update({ picked_by: [] }).eq("user_id", user.id).is("answer", null);
    const { error: upErr } = await admin.from("ai_duel").upsert(
      [...picks].map(([title_id, srcs]) => ({ user_id: user.id, title_id, picked_by: [...srcs] })),
      { onConflict: "user_id,title_id" },
    );
    if (upErr) return { cards: 0, sources, error: upErr.message };
    return { cards: picks.size, sources };
  } catch (e) {
    return { cards: 0, sources: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export type DuelCard = { id: number; title: string; poster_path: string | null; meta: string };

// 3) Karten der aktuellen Runde (gemischt, ohne Hinweis auf die Quelle)
export async function duelCards(): Promise<DuelCard[]> {
  const user = await requireAdminUser();
  const rows = (await duelRows(user.id)).filter((r) => !r.answer && r.picked_by.length && !r.picked_by.includes("check"));
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
export async function duelResults(): Promise<{
  pool: number; answered: number; results: DuelResult[]; recent: { since: string | null; results: DuelResult[] };
} | null> {
  const user = await requireAdminUser();
  const rows = await duelRows(user.id).catch(() => null);
  if (!rows) return null;
  const tally = (list: DuelRow[], sources: { key: string; name: string }[]) => sources.map(({ key: source, name }) => {
    const mine = list.filter((r) => r.picked_by.includes(source));
    return {
      source,
      name,
      passt: mine.filter((r) => r.answer === "passt").length,
      nicht: mine.filter((r) => r.answer === "passt_nicht").length,
      gesehen: mine.filter((r) => r.answer === "gesehen").length,
      offen: mine.filter((r) => !r.answer).length,
    };
  }).filter((r) => r.passt + r.nicht + r.gesehen + r.offen > 0);

  // Fairer Vergleich: nur Runden, in denen ALLE aktuellen Varianten antreten
  // (ab dem Zeitpunkt, zu dem die zuletzt hinzugekommene Variante zum ersten Mal beantwortet wurde)
  const firstAnswer = (key: string) => rows.filter((r) => r.picked_by.includes(key) && r.answered_at).map((r) => r.answered_at!).sort()[0] ?? null;
  const starts = DUEL_SOURCES.map((s) => firstAnswer(s.key));
  const since = starts.every(Boolean) ? starts.sort().at(-1)! : null;
  const recentRows = since ? rows.filter((r) => r.answered_at && r.answered_at >= since) : [];
  return {
    pool: rows.length,
    answered: rows.filter((r) => r.answer).length,
    results: tally(rows, [...ALL_SOURCES, ...PROBES]),
    recent: { since, results: tally(recentRows, [...DUEL_SOURCES, ...PROBES]) },
  };
}

// Alles zurücksetzen (Testfilme und Antworten; die KI-Einschätzungen bleiben gespeichert)
export async function duelReset() {
  const user = await requireAdminUser();
  await createAdminClient().from("ai_duel").delete().eq("user_id", user.id);
}
