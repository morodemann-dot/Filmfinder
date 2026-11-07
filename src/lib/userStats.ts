// Übersicht für Admins: Wie gut passen die Vorschläge bei allen Nutzern?
// Anonym: Nutzer erscheinen als "Nutzer A, B, …" (du selbst als "Du").
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAll } from "./fetchAll";
import { loadTasteData } from "./tasteData";
import { DUEL_SOURCES, duelAucCV } from "./duel";

export type UserStat = {
  label: string; me: boolean;
  rated: number; favorites: number; watchlist: number; notInterested: number;
  onboarding: boolean;
  answers: number; // Geschmacks-Check + Duell (passt / passt nicht)
  topYes: number; topNo: number; // Geschmacks-Check: Filme, die die App für gut passend hielt
  midYes: number; midNo: number; // Geschmacks-Check: Mittelfeld
  auc: number | null; // nachträglicher Test der aktuellen App auf den Antworten (fair geteilt)
};

type Fb = { user_id: string; status: string; rating: number | null; favorite?: boolean };
type Duel = { user_id: string; title_id: number; picked_by: string[]; answer: string | null };

export async function userStats(meId: string): Promise<{ users: UserStat[]; error?: string }> {
  const admin = createAdminClient();
  const [fb, duel, profiles] = await Promise.all([
    fetchAll<Fb>((from, to) => admin.from("user_title_feedback").select("user_id,status,rating,favorite").range(from, to))
      .catch(() => fetchAll<Fb>((from, to) => admin.from("user_title_feedback").select("user_id,status,rating").range(from, to))),
    fetchAll<Duel>((from, to) => admin.from("ai_duel").select("user_id,title_id,picked_by,answer").range(from, to)).catch(() => [] as Duel[]),
    admin.from("profiles").select("user_id,onboarding_done_at"),
  ]);
  const done = new Set(((profiles.data ?? []) as { user_id: string; onboarding_done_at: string | null }[])
    .filter((p) => p.onboarding_done_at).map((p) => p.user_id));
  const ids = [...new Set([...fb.map((f) => f.user_id), ...duel.map((d) => d.user_id)])];
  // Reihenfolge: du zuerst, dann nach Anzahl Bewertungen
  const ratedOf = (u: string) => fb.filter((f) => f.user_id === u && f.rating != null).length;
  ids.sort((a, b) => Number(b === meId) - Number(a === meId) || ratedOf(b) - ratedOf(a));

  const current = DUEL_SOURCES[0]; // die App, wie sie gerade im Filmfinder läuft
  const users: UserStat[] = [];
  let n = 0;
  for (const u of ids) {
    const mine = fb.filter((f) => f.user_id === u);
    const dl = duel.filter((d) => d.user_id === u && (d.answer === "passt" || d.answer === "passt_nicht"));
    const count = (tag: string, yes: boolean) => dl.filter((d) => d.picked_by.includes(tag) && (d.answer === "passt") === yes).length;
    let auc: number | null = null;
    if (dl.length >= 20) {
      try {
        const { rated, catalog } = await loadTasteData(admin, u);
        const answers = new Map(dl.map((d) => [d.title_id, d.answer === "passt"]));
        const byId = new Map(catalog.map((t) => [t.id, t]));
        const films = [...answers.keys()].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
        auc = duelAucCV(current, rated, catalog, new Map(), films, answers).auc;
      } catch { auc = null; }
    }
    users.push({
      label: u === meId ? "Du" : `Nutzer ${String.fromCharCode(65 + (n++ % 26))}`,
      me: u === meId,
      rated: mine.filter((f) => f.rating != null).length,
      favorites: mine.filter((f) => f.favorite).length,
      watchlist: mine.filter((f) => f.status === "merkliste").length,
      notInterested: mine.filter((f) => f.status === "nicht_interessiert").length,
      onboarding: done.has(u),
      answers: dl.length,
      topYes: count("check-top", true), topNo: count("check-top", false),
      midYes: count("check-mid", true), midNo: count("check-mid", false),
      auc,
    });
  }
  return { users };
}
