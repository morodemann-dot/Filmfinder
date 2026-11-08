"use server";

import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { loadTasteData } from "@/lib/tasteData";
import { buildNet, sharedFeatures } from "@/lib/filmNet";

export type NetNeighbor = { id: number; title: string; year: number | null; poster_path: string | null; sim: number; why: string[] };
export type NetDetails = {
  id: number; title: string; year: number | null; poster_path: string | null; genres: string[]; directors: string[];
  neighbors: NetNeighbor[];
};

// Details zu einem Film im Netz: mit wem ist er verbunden – und warum?
export async function netDetails(id: number): Promise<NetDetails | null> {
  const user = await getUser();
  if (!isAdmin(user?.email)) throw new Error("Nur für Admins.");
  const { catalog } = await loadTasteData(await createClient(), user!.id);
  const net = buildNet(catalog);
  const i = net.byId.get(id);
  if (i == null) return null;
  const t = net.titles[i];
  const neighbors: NetNeighbor[] = [];
  for (let k = 0; k < net.edges.length; k += 3) {
    const a = net.edges[k], b = net.edges[k + 1];
    const j = a === i ? b : b === i ? a : -1;
    if (j < 0) continue;
    const o = net.titles[j];
    neighbors.push({ id: o.id, title: o.title, year: o.release_year ?? null, poster_path: o.poster_path ?? null, sim: net.edges[k + 2] / 1000, why: sharedFeatures(net, i, j) });
  }
  neighbors.sort((x, y) => y.sim - x.sim);
  return {
    id: t.id, title: t.title, year: t.release_year ?? null, poster_path: t.poster_path ?? null,
    genres: t.genres ?? [], directors: t.directors ?? [], neighbors,
  };
}
