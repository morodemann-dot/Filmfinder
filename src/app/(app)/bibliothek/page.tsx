import Link from "next/link";
import TitleCard from "@/components/TitleCard";
import { createClient, getUser } from "@/lib/supabase/server";
import { STATUS_LABEL, formatScore, type Status, type Title } from "@/lib/types";
import ProfilePanel from "@/components/ProfilePanel";

// Persönliche Bibliothek: alles, was du schon eingeordnet hast.

// "Nicht gesehen" wird intern gespeichert (damit es beim Bewerten nicht wiederkommt), aber hier nicht angezeigt.
const TABS: Status[] = ["gesehen", "merkliste", "nicht_interessiert"];

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const favTab = sp.tab === "lieblinge";
  const tab = (TABS.includes(sp.tab as Status) ? sp.tab : "gesehen") as Status;

  const supabase = await createClient();
  const user = await getUser();
  const { data } = await supabase
    .from("user_title_feedback")
    .select("*,titles(id,title,poster_path,release_year,format)") // "*" = inkl. Lieblingsfilm, falls vorhanden
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false });

  type Row = { status: Status; rating: number | null; favorite?: boolean; titles: Title | null };
  const rows = (data ?? []) as unknown as Row[];
  const counts = Object.fromEntries(TABS.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const favCount = rows.filter((r) => r.favorite).length;
  const shown = rows.filter((r) => (favTab ? r.favorite : r.status === tab) && r.titles);

  const { data: profile, error: profileError } = await supabase.from("profiles").select("display_name,share_together").eq("user_id", user!.id).maybeSingle();
  return (
    <>
      <div className="topbar" style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>Bibliothek</h1>
        <Link href="/imdb" className="btn small">IMDb importieren</Link>
      </div>
      <div className="chips">
        <Link href="/bibliothek?tab=lieblinge" className="chip" aria-current={favTab}>♥ Lieblingsfilme ({favCount})</Link>
        {TABS.map((s) => (
          <Link key={s} href={`/bibliothek?tab=${s}`} className="chip" aria-current={!favTab && tab === s}>
            {STATUS_LABEL[s]} ({counts[s]})
          </Link>
        ))}
      </div>
      {shown.length ? (
        <div className="grid">
          {shown.map((r) => (
            <TitleCard key={r.titles!.id} t={r.titles!} badge={formatScore(r.rating)} />
          ))}
        </div>
      ) : (
        <div className="empty">{favTab
          ? "Noch keine Lieblingsfilme. Markiere sie auf der Filmseite oder beim Bewerten mit ♥ – unabhängig von den Punkten."
          : "Hier ist noch nichts. Leg los unter „Bewerten“."}</div>
      )}
      <ProfilePanel name={profile?.display_name ?? ""} share={!!profile?.share_together} ready={!profileError} />
    </>
  );
}
