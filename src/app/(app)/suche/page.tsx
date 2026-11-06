import TitleCard from "@/components/TitleCard";
import Poster from "@/components/Poster";
import { addFromTmdb } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { searchTmdb } from "@/lib/tmdb";
import type { Title } from "@/lib/types";

// Suche: zuerst im eigenen Katalog, zusätzlich live bei TMDB –
// so findest du auch Titel, die noch nicht im Katalog sind.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  let local: Title[] = [];
  let remote: Awaited<ReturnType<typeof searchTmdb>> = [];
  let remoteError = false;

  if (query.length >= 2) {
    const supabase = await createClient();
    const safe = query.replace(/[%,()]/g, " ");
    const { data } = await supabase
      .from("titles")
      .select("id,title,poster_path,release_year,format,media_type,tmdb_id")
      .or(`title.ilike.%${safe}%,original_title.ilike.%${safe}%`)
      .order("popularity", { ascending: false, nullsFirst: false })
      .limit(30);
    local = (data ?? []) as Title[];

    try {
      const known = new Set(local.map((t) => `${t.media_type}-${t.tmdb_id}`));
      remote = (await searchTmdb(query)).filter((r) => !known.has(`${r.media_type}-${r.tmdb_id}`));
    } catch {
      remoteError = true;
    }
  }

  return (
    <>
      <h1>Suche</h1>
      <form action="/suche" style={{ marginBottom: 18 }}>
        <input
          className="input"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Film oder Serie suchen …"
          autoComplete="off"
          enterKeyHint="search"
        />
      </form>

      {query.length >= 2 && (
        <>
          <h2 className="section">Im Katalog</h2>
          {local.length ? (
            <div className="grid">
              {local.map((t) => <TitleCard key={t.id} t={t} />)}
            </div>
          ) : (
            <p className="muted small">Noch nicht im Katalog.</p>
          )}

          <h2 className="section">Weitere Treffer bei TMDB</h2>
          {remoteError && <p className="error">Die TMDB-Suche hat gerade nicht geklappt.</p>}
          {remote.length > 0 ? (
            <div className="grid">
              {remote.map((r) => (
                <form key={`${r.media_type}-${r.tmdb_id}`} action={addFromTmdb.bind(null, r.media_type, r.tmdb_id)}>
                  <button className="card" style={{ background: "none", border: 0, padding: 0, textAlign: "left", width: "100%", cursor: "pointer" }}>
                    <Poster path={r.poster_path} title={r.title} size="w185" badge="+ hinzufügen" />
                    <div className="card-title">{r.title}</div>
                    <div className="card-meta">
                      {[r.media_type === "movie" ? "Film" : "Serie", r.year].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                </form>
              ))}
            </div>
          ) : (
            !remoteError && <p className="muted small">Keine weiteren Treffer.</p>
          )}
        </>
      )}
    </>
  );
}
