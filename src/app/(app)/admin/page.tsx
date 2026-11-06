import Link from "next/link";
import { notFound } from "next/navigation";
import AddPanel from "./AddPanel";
import CatalogManager, { type ManageTitle } from "./CatalogManager";
import Curate from "./Curate";
import { clearBlocklist, unblockTitle } from "@/app/actions";
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
  const curate = bereich === "aussortieren";

  const admin = createAdminClient();
  const [movies, shows, blocked] = await Promise.all([
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "movie"),
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "tv"),
    admin.from("excluded_titles").select("tmdb_id", { count: "exact", head: true }),
  ]);

  const genreRows = curate ? (await admin.from("titles").select("genres").limit(5000)).data ?? [] : [];
  const genres = [...new Set(genreRows.flatMap((r) => r.genres as string[]))].sort((a, b) => a.localeCompare(b, "de"));

  const blockedList = manage
    ? (await admin.from("excluded_titles").select("media_type,tmdb_id,title,excluded_at").order("excluded_at", { ascending: false }).limit(500)).data ?? []
    : [];

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

      <div className="segmented" style={{ margin: "14px 0 20px", maxWidth: 420 }}>
        <Link href="/admin" aria-pressed={!manage && !curate} className="seg-link">Hinzufügen</Link>
        <Link href="/admin?bereich=aussortieren" aria-pressed={curate} className="seg-link">Aussortieren</Link>
        <Link href="/admin?bereich=verwalten" aria-pressed={manage} className="seg-link">Verwalten</Link>
      </div>

      {curate ? (
        <Curate genres={genres} />
      ) : manage ? (
        <>
          <CatalogManager titles={titles} />
          {blockedList.length > 0 && (
            <details className="panel" style={{ marginTop: 24 }}>
              <summary className="eyebrow" style={{ cursor: "pointer" }}>Sperrliste · {blocked.count} aussortierte Titel</summary>
              <p className="caption">
                Diese Titel werden bei allen Importen übersprungen – auch beim IMDb-Import.
                Nur wenn du sie hier wieder aufnimmst oder in der Suche bewusst hinzufügst, kommen sie zurück.
              </p>
              <div className="manage-list">
                {blockedList.map((b) => (
                  <div key={`${b.media_type}-${b.tmdb_id}`} className="manage-item" style={{ gridTemplateColumns: "1fr auto auto" }}>
                    <div className="manage-title">{b.title ?? `TMDB ${b.tmdb_id}`}</div>
                    <form action={unblockTitle.bind(null, b.media_type as string, b.tmdb_id as number, true)}>
                      <button className="btn" style={{ minHeight: 32, fontSize: "0.8rem" }}>Wieder aufnehmen</button>
                    </form>
                    <form action={unblockTitle.bind(null, b.media_type as string, b.tmdb_id as number, false)}>
                      <button className="btn ghost" style={{ minHeight: 32, fontSize: "0.8rem" }} title="Nur von der Sperrliste nehmen">Entsperren</button>
                    </form>
                  </div>
                ))}
              </div>
              <form action={clearBlocklist} style={{ marginTop: 14 }}>
                <button className="btn ghost">Ganze Sperrliste leeren</button>
              </form>
            </details>
          )}
        </>
      ) : (
        <AddPanel />
      )}
    </>
  );
}
