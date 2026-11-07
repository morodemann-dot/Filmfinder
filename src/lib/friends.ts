// Freunde-Funktionen (NUR auf dem Server verwenden, nutzt den geheimen Schlüssel – Bewertungen anderer werden NIE angezeigt,
// nur zusammengefasst verwendet).
import { createAdminClient } from "./supabase/server";
import { fetchAll } from "./fetchAll";
import type { RatedTitle } from "./recommend";
import type { Title } from "./types";

type Fb = { user_id: string; title_id: number; status: string; rating: number | null; reason?: string | null; aspects?: string[] };

async function allRatings(): Promise<Fb[]> {
  return fetchAll<Fb>((from, to) =>
    createAdminClient().from("user_title_feedback").select("user_id,title_id,status,rating").not("rating", "is", null).range(from, to),
    50000,
  ).catch(() => []);
}

// "Leute mit ähnlichem Geschmack mochten …"
// Ähnlichkeit = wie gleich ihr dieselben Filme bewertet habt (mind. 6 gemeinsame Filme).
export async function neighborPicks(userId: string, candidateIds: Set<number>) {
  const rows = await allRatings();
  const mine = new Map(rows.filter((r) => r.user_id === userId).map((r) => [r.title_id, r.rating!]));
  const byUser = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (r.user_id === userId) continue;
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Map());
    byUser.get(r.user_id)!.set(r.title_id, r.rating!);
  }
  const neighbors: { sim: number; ratings: Map<number, number>; mean: number }[] = [];
  for (const ratings of byUser.values()) {
    const co = [...ratings.keys()].filter((id) => mine.has(id));
    if (co.length < 6) continue;
    const a = co.map((id) => mine.get(id)!), b = co.map((id) => ratings.get(id)!);
    const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < co.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    const r = da && db ? num / Math.sqrt(da * db) : 0;
    const sim = r * (co.length / (co.length + 10)); // wenige gemeinsame Filme = vorsichtig
    if (sim > 0.15) {
      const all = [...ratings.values()];
      neighbors.push({ sim, ratings, mean: all.reduce((s, x) => s + x, 0) / all.length });
    }
  }
  if (!neighbors.length) return { count: 0, picks: [] as { id: number; avg: number; n: number; score: number }[] };
  const agg = new Map<number, { s: number; w: number; sum: number; n: number }>();
  for (const nb of neighbors) {
    for (const [id, r] of nb.ratings) {
      if (!candidateIds.has(id) || r < 7) continue;
      const a = agg.get(id) ?? { s: 0, w: 0, sum: 0, n: 0 };
      a.s += nb.sim * (r - nb.mean); a.w += nb.sim; a.sum += r; a.n++;
      agg.set(id, a);
    }
  }
  const picks = [...agg.entries()]
    .map(([id, a]) => ({ id, avg: a.sum / a.n, n: a.n, score: a.s / a.w + 0.3 * Math.log(1 + a.n) }))
    .filter((p) => p.score > 0.3)
    .sort((x, y) => y.score - x.score);
  return { count: neighbors.length, picks };
}

// Gemeinsam schauen: Freunde, die das freigegeben haben
export async function togetherFriends(userId: string) {
  const { data, error } = await createAdminClient().from("profiles").select("user_id,display_name,share_together");
  if (error) return { me: null, friends: [] as { id: string; name: string }[] };
  const me = data?.find((p) => p.user_id === userId) ?? null;
  const friends = (data ?? [])
    .filter((p) => p.user_id !== userId && p.share_together && p.display_name)
    .map((p) => ({ id: p.user_id as string, name: p.display_name as string }));
  return { me, friends };
}

// Einträge eines Freundes (nur wenn er gemeinsames Schauen freigegeben hat), verbunden mit dem Katalog
export async function friendRated(friendId: string, catalog: Title[]): Promise<RatedTitle[]> {
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("share_together").eq("user_id", friendId).maybeSingle();
  if (!prof?.share_together) return [];
  const rows = await fetchAll<Fb>((from, to) =>
    admin.from("user_title_feedback").select("user_id,title_id,status,rating,reason,aspects").eq("user_id", friendId).range(from, to),
  ).catch(() => fetchAll<Fb>((from, to) =>
    admin.from("user_title_feedback").select("user_id,title_id,status,rating").eq("user_id", friendId).range(from, to),
  ));
  const byId = new Map(catalog.map((t) => [t.id, t]));
  return rows.flatMap((r) => {
    const t = byId.get(r.title_id);
    return t ? [{ ...t, status: r.status, rating: r.rating, reason: r.reason ?? null, aspects: r.aspects ?? [] }] : [];
  });
}
