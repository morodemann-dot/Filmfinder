import QuickRate from "./QuickRate";
import RateTabs from "@/components/RateTabs";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadTasteData } from "@/lib/tasteData";
import { rankLikelySeen, type RateCandidate } from "@/lib/likelySeen";

// "Schnell bewerten": ein Titel nach dem anderen.
// Reihenfolge: zuerst Filme, die du wahrscheinlich schon gesehen hast (Reihen, Regie, Besetzung, Bekanntheit).
// Schnell: nutzt den zwischengespeicherten Katalog (statt bei jedem Aufruf alle Filme neu zu laden).
export default async function RatePage() {
  const supabase = await createClient();
  const user = await getUser();
  const { rated, catalog } = await loadTasteData(supabase, user!.id);

  const done = new Set(rated.map((r) => r.id));
  const seen = rated.filter((r) => r.status === "gesehen")
    .map((r) => ({ directors: r.directors ?? null, cast_names: r.cast_names ?? null, collection_id: r.collection_id ?? null }));
  const queue = rankLikelySeen((catalog as unknown as RateCandidate[]).filter((t) => !done.has(t.id)), seen).slice(0, 150);

  return (
    <>
      <RateTabs active="bewerten" />
      <QuickRate titles={queue} alreadyDone={done.size} ratedBefore={rated.filter((r) => r.rating != null).length} />
    </>
  );
}
