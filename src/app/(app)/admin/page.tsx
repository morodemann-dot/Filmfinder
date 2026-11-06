import Link from "next/link";
import { notFound } from "next/navigation";
import AddPanel from "./AddPanel";
import CatalogManager, { type ManageTitle } from "./CatalogManager";
import { clearBlocklist } from "@/app/actions";
import { createAdminClient, getUser, isAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";

// Der Import darf bis zu 60 Sekunden dauern.
export const maxDuration = 60;

// Katalog: nur für Admins (E-Mail steht in ADMIN_EMAILS).
// Zwei Bereiche: "Hinzufügen" und "Verwalten".
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  const user = await getUser();
  if (!isAdmin(user?.email)) notFound();
  const { bereich } = await searchParams;
  const manage = bereich === "verwalten";

  const admin = createAdminClient();
  const [movies, shows, blocked] = await Promise.all([
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "movie"),
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "tv"),
    admin.from("excluded_titles").select("tmdb_id", { count: "exact", head: true }),
  ]);

  const titles = manage
    ? await fetchAll<ManageTitle>((from, to) =>
        admin.from("titles").select("id,title,release_year,media_type,poster_path,created_at,oscars").range(from, to),
      )
    : [];

  return (
    <>
      <h1>Katalog</h1>
      <p className="caption" style={{ marginTop: -4 }}>
        {movies.count ?? 0} Filme · {shows.count ?? 0} Serien
        {(blocked.count ?? 0) > 0 && ` · ${blocked.count} gesperrt`}
      </p>

      <div className="segmented" style={{ margin: "14px 0 20px", maxWidth: 360 }}>
        <Link href="/admin" aria-pressed={!manage} className="seg-link">Hinzufügen</Link>
        <Link href="/admin?bereich=verwalten" aria-pressed={manage} className="seg-link">Verwalten</Link>
      </div>

      {manage ? (
        <>
          <CatalogManager titles={titles} />
          {(blocked.count ?? 0) > 0 && (
            <form action={clearBlocklist} className="panel" style={{ marginTop: 24 }}>
              <div className="eyebrow">Sperrliste</div>
              <p className="caption">
                {blocked.count} entfernte Titel werden bei Importen übersprungen. Leeren, wenn sie wieder erlaubt sein sollen.
              </p>
              <button className="btn">Sperrliste leeren</button>
            </form>
          )}
        </>
      ) : (
        <AddPanel />
      )}
    </>
  );
}
