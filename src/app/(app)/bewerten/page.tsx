import QuickRate from "./QuickRate";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Title } from "@/lib/types";

// "Schnell bewerten": ein Titel nach dem anderen. Ideal zum Start, damit die App
// schnell erste Daten über deinen Geschmack bekommt.
export default async function RatePage() {
  const supabase = await createClient();
  const user = await getUser();

  const { count: done } = await supabase
    .from("user_title_feedback")
    .select("title_id", { count: "exact", head: true })
    .eq("user_id", user!.id);

  // Die beliebtesten noch nicht eingeordneten Titel (die Datenbank filtert Bewertetes heraus)
  const { data } = await supabase.rpc("discover_titles", { p_sort: "beliebt", p_limit: 30 });

  return (
    <>
      <h1>Schnell bewerten</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Gesehen? Gib 1–10 Punkte. Nicht gesehen? Einfach weiter – oder auf die Merkliste.
        Bisher eingeordnet: <strong>{done ?? 0}</strong>
      </p>
      <QuickRate titles={(data ?? []) as Title[]} />
    </>
  );
}
