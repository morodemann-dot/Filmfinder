import Link from "next/link";
import TitleCard from "@/components/TitleCard";
import { createClient, getUser } from "@/lib/supabase/server";
import { STATUS_LABEL, formatStars, type Status, type Title } from "@/lib/types";

// Persönliche Bibliothek: alles, was du schon eingeordnet hast.

const TABS: Status[] = ["gesehen", "merkliste", "nicht_interessiert", "nicht_gesehen"];

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = (TABS.includes(sp.tab as Status) ? sp.tab : "gesehen") as Status;

  const supabase = await createClient();
  const user = await getUser();
  const { data } = await supabase
    .from("user_title_feedback")
    .select("status,rating,updated_at,titles(id,title,poster_path,release_year,format)")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false });

  type Row = { status: Status; rating: number | null; titles: Title | null };
  const rows = (data ?? []) as unknown as Row[];
  const counts = Object.fromEntries(TABS.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const shown = rows.filter((r) => r.status === tab && r.titles);

  return (
    <>
      <h1>Bibliothek</h1>
      <div className="chips">
        {TABS.map((s) => (
          <Link key={s} href={`/bibliothek?tab=${s}`} className="chip" aria-current={tab === s}>
            {STATUS_LABEL[s]} ({counts[s]})
          </Link>
        ))}
      </div>
      {shown.length ? (
        <div className="grid">
          {shown.map((r) => (
            <TitleCard key={r.titles!.id} t={r.titles!} badge={formatStars(r.rating)} />
          ))}
        </div>
      ) : (
        <div className="empty">Hier ist noch nichts. Leg los unter „Bewerten“.</div>
      )}
    </>
  );
}
