import Link from "next/link";
import TitleCard from "@/components/TitleCard";
import { createClient } from "@/lib/supabase/server";
import type { Title } from "@/lib/types";

// Startseite "Entdecken": Titel, die du noch nicht eingeordnet hast.
// (In Stufe 3 kommt hier die persönliche Rangliste dazu.)

const FORMATS = { alle: "Alle", film: "Filme", serie: "Serien" } as const;
const SORTS = {
  beliebt: "Beliebt",
  neu: "Neu im Katalog",
  preise: "🏆 Preisgekrönt",
  jahr_neu: "Neueste zuerst",
  jahr_alt: "Älteste zuerst",
} as const;
const DECADES = [1980, 1990, 2000, 2010, 2020];
const PER_PAGE = 60;

type SP = { format?: string; genre?: string; sort?: string; jahrzehnt?: string; seite?: string };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const format = (sp.format && sp.format in FORMATS ? sp.format : "alle") as keyof typeof FORMATS;
  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : "beliebt") as keyof typeof SORTS;
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
  const genres = [...new Set((genreRows ?? []).flatMap((r) => r.genres as string[]))].sort((a, b) =>
    a.localeCompare(b, "de"),
  );
  const list = ((titles ?? []) as Title[]).slice(0, PER_PAGE);
  const hasMore = (titles?.length ?? 0) > PER_PAGE;

  // Baut einen Link mit geänderten Filtern (und springt zurück auf Seite 1)
  const link = (change: Partial<Record<keyof SP, string | null>>, keepPage = false) => {
    const cur: Record<string, string | null> = {
      format: format === "alle" ? null : format,
      sort: sort === "beliebt" ? null : sort,
      jahrzehnt: decade ? String(decade) : null,
      genre,
      seite: keepPage ? String(page) : null,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...cur, ...change })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <>
      <h1>Entdecken</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Titel, die du noch nicht eingeordnet hast. Je mehr du bewertest, desto besser lernt die App deinen Geschmack.
      </p>

      <div className="chips">
        {Object.entries(SORTS).map(([k, label]) => (
          <Link key={k} href={link({ sort: k === "beliebt" ? null : k })} className="chip" aria-current={sort === k}>
            {label}
          </Link>
        ))}
      </div>
      <div className="chips">
        {Object.entries(FORMATS).map(([k, label]) => (
          <Link key={k} href={link({ format: k === "alle" ? null : k })} className="chip" aria-current={format === k}>
            {label}
          </Link>
        ))}
        <span style={{ width: 8, flex: "none" }} />
        <Link href={link({ jahrzehnt: null })} className="chip" aria-current={!decade}>Alle Jahre</Link>
        {DECADES.map((d) => (
          <Link key={d} href={link({ jahrzehnt: String(d) })} className="chip" aria-current={decade === d}>
            {d === 2020 ? "ab 2020" : `${String(d).slice(2)}er`}
          </Link>
        ))}
      </div>
      {genres.length > 0 && (
        <div className="chips">
          <Link href={link({ genre: null })} className="chip" aria-current={!genre}>Alle Genres</Link>
          {genres.map((g) => (
            <Link key={g} href={link({ genre: g })} className="chip" aria-current={genre === g}>{g}</Link>
          ))}
        </div>
      )}

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
          <div className="row" style={{ justifyContent: "center", marginTop: 22 }}>
            {page > 1 && <Link className="btn" href={link({ seite: String(page - 1) })}>← Zurück</Link>}
            {hasMore && <Link className="btn primary" href={link({ seite: String(page + 1) })}>Mehr anzeigen →</Link>}
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
