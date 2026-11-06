import Link from "next/link";
import { Suspense } from "react";
import TitleCard from "@/components/TitleCard";
import FilterBar from "@/components/FilterBar";
import SearchResults from "@/components/SearchResults";
import { createClient } from "@/lib/supabase/server";
import type { Title } from "@/lib/types";

// Startseite "Entdecken": Suchfeld oben. Ohne Suchbegriff der ganze Katalog
// (ohne das, was du schon eingeordnet hast), mit Suchbegriff die Treffer.

const SORTS = {
  beliebt: "Beliebt",
  neu: "Neu im Katalog",
  preise: "Preisgekrönt",
  jahr_neu: "Neueste zuerst",
  jahr_alt: "Älteste zuerst",
};
const DECADES = [1980, 1990, 2000, 2010, 2020];
const PER_PAGE = 120;

type SP = { q?: string; format?: string; genre?: string; sort?: string; jahrzehnt?: string; seite?: string };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();

  const searchBox = (
    <form action="/" className="searchbox" role="search">
      <svg viewBox="0 0 24 24" aria-hidden><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" /></svg>
      <input name="q" type="search" defaultValue={query} placeholder="Film oder Serie suchen …"
        autoComplete="off" enterKeyHint="search" aria-label="Suchen" />
      {query && <Link href="/" className="searchbox-clear" aria-label="Suche beenden">Abbrechen</Link>}
    </form>
  );

  if (query) {
    return (
      <>
        <h1>Entdecken</h1>
        {searchBox}
        <SearchResults query={query} />
      </>
    );
  }
  const format = sp.format === "film" || sp.format === "serie" ? sp.format : null;
  const sort = sp.sort && sp.sort in SORTS ? sp.sort : "beliebt";
  const decade = DECADES.includes(Number(sp.jahrzehnt)) ? Number(sp.jahrzehnt) : null;
  const genre = sp.genre ?? null;
  const page = Math.max(1, Number(sp.seite) || 1);

  const supabase = await createClient();
  const [{ data: titles, error }, { data: genreRows }] = await Promise.all([
    supabase.rpc("discover_titles", {
      p_media: format === "film" ? "movie" : format === "serie" ? "tv" : null,
      p_genre: genre,
      p_decade: decade,
      p_sort: sort,
      p_limit: PER_PAGE + 1, // einer mehr, um zu wissen, ob es weitergeht
      p_offset: (page - 1) * PER_PAGE,
    }),
    supabase.from("titles").select("genres").limit(5000),
  ]);
  const genres = [...new Set((genreRows ?? []).flatMap((r) => r.genres as string[]))].sort((a, b) => a.localeCompare(b, "de"));
  const list = ((titles ?? []) as Title[]).slice(0, PER_PAGE);
  const hasMore = (titles?.length ?? 0) > PER_PAGE;

  const pageLink = (n: number) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    if (n > 1) p.set("seite", String(n));
    else p.delete("seite");
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <>
      <h1>Entdecken</h1>
      {searchBox}
      <Suspense>
        <FilterBar sorts={SORTS} defaultSort="beliebt" genres={genres} decades={DECADES} />
      </Suspense>

      {error ? (
        <div className="empty error">
          Die Entdecken-Abfrage fehlt noch in der Datenbank (Ergänzung 6 im Supabase SQL Editor ausführen).
          <br />
          <span className="small">{error.message}</span>
        </div>
      ) : list.length > 0 ? (
        <>
          <div className="grid">
            {list.map((t) => (
              <TitleCard key={t.id} t={t} badge={(t.oscars?.length ?? 0) > 0 ? `🏆 ${t.oscars!.length}` : null} />
            ))}
          </div>
          <div className="pager">
            {page > 1 && <Link className="btn" href={pageLink(page - 1)}>Zurück</Link>}
            {hasMore && <Link className="btn primary" href={pageLink(page + 1)}>Mehr anzeigen</Link>}
          </div>
        </>
      ) : (
        <div className="empty">
          {genreRows && genreRows.length === 0
            ? "Der Katalog ist noch leer. Ein Admin kann ihn unter „Katalog“ füllen."
            : "Hier ist nichts (mehr) – probier einen anderen Filter."}
        </div>
      )}
    </>
  );
}
