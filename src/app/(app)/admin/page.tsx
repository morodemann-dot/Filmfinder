import Link from "next/link";
import { notFound } from "next/navigation";
import AddPanel from "./AddPanel";
import CatalogManager, { type ManageTitle } from "./CatalogManager";
import Curate from "./Curate";
import Suspects from "./Suspects";
import Review from "./Review";
import DataStatus, { type DataRow } from "./DataStatus";
import { SettingsPanel } from "./SourceForms";
import { DEFAULT_SETTINGS, getCatalogSettings } from "@/lib/importer";
import { clearBlocklist, unblockTitle } from "@/app/actions";
import { createAdminClient, getUser, isAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";

// Der Import darf bis zu 60 Sekunden dauern.
export const maxDuration = 60;

// Katalog: nur für Admins (E-Mail steht in ADMIN_EMAILS).
// Bereiche: Hinzufügen (mit "Neu prüfen"), Aussortieren, Verdachtsfälle, Verwalten.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  const user = await getUser();
  if (!isAdmin(user?.email)) notFound();
  const { bereich } = await searchParams;
  const manage = bereich === "verwalten";
  const curate = bereich === "aussortieren";
  const suspects = bereich === "verdacht";
  const review = bereich === "pruefen";
  const daten = bereich === "daten";
  const add = !manage && !curate && !suspects && !review && !daten;

  const admin = createAdminClient();
  const [movies, shows, blocked, waiting] = await Promise.all([
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "movie"),
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "tv"),
    admin.from("excluded_titles").select("tmdb_id", { count: "exact", head: true }),
    admin.from("import_candidates").select("id", { count: "exact", head: true }).eq("status", "offen"),
  ]);
  const waitingCount = waiting.error ? 0 : (waiting.count ?? 0);
  const settings = add ? await getCatalogSettings().catch(() => DEFAULT_SETTINGS) : DEFAULT_SETTINGS;

  const genreRows = curate || suspects || review ? (await admin.from("titles").select("genres").limit(5000)).data ?? [] : [];
  const genres = [...new Set(genreRows.flatMap((r) => r.genres as string[]))].sort((a, b) => a.localeCompare(b, "de"));

  const blockedList = manage
    ? (await admin.from("excluded_titles").select("media_type,tmdb_id,title,excluded_at").order("excluded_at", { ascending: false }).limit(500)).data ?? []
    : [];

  const dataRows = daten
    ? await fetchAll<DataRow>((from, to) =>
        admin.from("titles")
          .select("vote_count,runtime_seconds,directors,cast_names,writers,cinematographers,composers,keywords,certification_de,collection_id,oscars,globes,festivals,canon,based_on,wd_genres,narrative_locations,set_in_period,main_subjects,wikidata_checked_at")
          .eq("media_type", "movie").range(from, to),
      ).catch(() => [] as DataRow[])
    : [];
  const tmdbMissing = daten
    ? (await admin.from("titles").select("id", { count: "exact", head: true }).or("vote_count.is.null,keywords.is.null")).count ?? 0
    : 0;

  const titles = manage
    ? await fetchAll<ManageTitle>((from, to) =>
        admin.from("titles").select("id,tmdb_id,imdb_id,title,original_title,original_language,countries,release_year,media_type,poster_path,created_at,oscars,globes,runtime_seconds").range(from, to),
      )
    : [];

  return (
    <>
      <h1>Katalog</h1>
      <p className="caption" style={{ marginTop: -4 }}>
        {movies.count ?? 0} Filme · {shows.count ?? 0} Serien
        {(blocked.count ?? 0) > 0 && ` · ${blocked.count} gesperrt`}
      </p>

      <div className="segmented four" style={{ margin: "14px 0 20px", maxWidth: 520 }}>
        <Link href="/admin" aria-pressed={add || review || daten} className="seg-link">Hinzufügen</Link>
        <Link href="/admin?bereich=aussortieren" aria-pressed={curate} className="seg-link">Aussortieren</Link>
        <Link href="/admin?bereich=verdacht" aria-pressed={suspects} className="seg-link">Verdachtsfälle</Link>
        <Link href="/admin?bereich=verwalten" aria-pressed={manage} className="seg-link">Verwalten</Link>
      </div>

      {daten ? (
        <>
          <Link href="/admin" className="caption">‹ Zurück zu Hinzufügen</Link>
          <h2 style={{ marginTop: 10 }}>Datenlage</h2>
          <DataStatus rows={dataRows} tmdbMissing={tmdbMissing} />
        </>
      ) : review ? (
        <>
          <Link href="/admin" className="caption">‹ Zurück zu Hinzufügen</Link>
          <h2 style={{ marginTop: 10 }}>Neu prüfen</h2>
          <Review genres={genres} initialCount={waitingCount} />
        </>
      ) : curate ? (
        <Curate genres={genres} />
      ) : suspects ? (
        <Suspects genres={genres} />
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
        <>
          {waitingCount > 0 && (
            <Link href="/admin?bereich=pruefen" className="waiting-banner">
              <span><strong>{waitingCount} neue Filme</strong> warten auf deine Prüfung</span>
              <span className="waiting-cta">Jetzt prüfen ›</span>
            </Link>
          )}
          <Link href="/admin?bereich=daten" className="waiting-banner" style={{ background: "var(--surface)" }}>
            <span>Wie gut sind die Filme beschrieben?</span>
            <span className="waiting-cta">Datenlage ›</span>
          </Link>
          <SettingsPanel settings={settings} />
          <AddPanel />
        </>
      )}
    </>
  );
}
