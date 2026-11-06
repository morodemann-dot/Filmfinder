import QuickRate from "./QuickRate";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Title } from "@/lib/types";

// "Schnell bewerten": ein Titel nach dem anderen. Ideal zum Start, damit die App
// schnell erste Daten über deinen Geschmack bekommt.
export default async function RatePage() {
  const supabase = await createClient();
  const user = await getUser();

  const { data: fb } = await supabase
    .from("user_title_feedback")
    .select("title_id")
    .eq("user_id", user!.id);
  const done = (fb ?? []).map((f) => f.title_id as number);

  let q = supabase
    .from("titles")
    .select("id,title,poster_path,release_year,format,genres")
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(30);
  if (done.length) q = q.not("id", "in", `(${done.join(",")})`);
  const { data } = await q;

  return (
    <>
      <h1>Schnell bewerten</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Gesehen? Gib Sterne. Nicht gesehen? Einfach weiter – oder auf die Merkliste.
        Bisher eingeordnet: <strong>{done.length}</strong>
      </p>
      <QuickRate titles={(data ?? []) as Title[]} />
    </>
  );
}
