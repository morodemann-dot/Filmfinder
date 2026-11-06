import QuickRate from "./QuickRate";
import { createClient, getUser } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { rankLikelySeen, type RateCandidate, type SeenTitle } from "@/lib/likelySeen";

// "Schnell bewerten": ein Titel nach dem anderen.
// Reihenfolge: zuerst Filme, die du wahrscheinlich schon gesehen hast (Reihen, Regie, Besetzung, Bekanntheit).

const COLS = "id,title,poster_path,release_year,format,genres,directors,cast_names,collection_id,collection_name,popularity";

export default async function RatePage() {
  const supabase = await createClient();
  const user = await getUser();

  const [mine, catalog] = await Promise.all([
    fetchAll<{ title_id: number; status: string; titles: SeenTitle | null }>((from, to) =>
      supabase
        .from("user_title_feedback")
        .select("title_id,status,titles(directors,cast_names,collection_id)")
        .eq("user_id", user!.id)
        .range(from, to),
    ),
    fetchAll<RateCandidate>((from, to) => supabase.from("titles").select(COLS).range(from, to)),
  ]);

  const done = new Set(mine.map((m) => m.title_id));
  const seen = mine.filter((m) => m.status === "gesehen" && m.titles).map((m) => m.titles!);
  const queue = rankLikelySeen(catalog.filter((t) => !done.has(t.id)), seen).slice(0, 150);

  return (
    <>
      <h1>Schnell bewerten</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Gesehen? Gib 1–10 Punkte. Nicht gesehen? Einfach weiter – oder auf die Merkliste.
        Bisher eingeordnet: <strong>{done.size}</strong>
      </p>
      <QuickRate titles={queue} />
    </>
  );
}
