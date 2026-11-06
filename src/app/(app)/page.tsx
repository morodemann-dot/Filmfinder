import Link from "next/link";
import TitleCard from "@/components/TitleCard";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Title } from "@/lib/types";

// Startseite "Entdecken": zeigt Titel aus dem Katalog, die du noch nicht eingeordnet hast.
// (In Stufe 3 wird hier die persönliche Rangliste stehen – jetzt erstmal nach Beliebtheit.)

const FORMATS = { alle: "Alle", film: "Filme", serie: "Serien" } as const;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; genre?: string }>;
}) {
  const sp = await searchParams;
  const format = (sp.format && sp.format in FORMATS ? sp.format : "alle") as keyof typeof FORMATS;
  const genre = sp.genre ?? null;

  const supabase = await createClient();
  const user = await getUser();

  const [{ data: fb }, { data: genreRows }] = await Promise.all([
    supabase.from("user_title_feedback").select("title_id").eq("user_id", user!.id),
    supabase.from("titles").select("genres").limit(5000),
  ]);
  const seen = (fb ?? []).map((f) => f.title_id as number);
  const genres = [...new Set((genreRows ?? []).flatMap((r) => r.genres as string[]))].sort((a, b) =>
    a.localeCompare(b, "de"),
  );

  let q = supabase
    .from("titles")
    .select("id,title,poster_path,release_year,format")
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(90);
  if (format === "film") q = q.eq("media_type", "movie");
  if (format === "serie") q = q.eq("media_type", "tv");
  if (genre) q = q.contains("genres", [genre]);
  if (seen.length) q = q.not("id", "in", `(${seen.join(",")})`);
  const { data: titles } = await q;

  const link = (f: string, g: string | null) => {
    const p = new URLSearchParams();
    if (f !== "alle") p.set("format", f);
    if (g) p.set("genre", g);
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
        {Object.entries(FORMATS).map(([k, label]) => (
          <Link key={k} href={link(k, genre)} className="chip" aria-current={format === k}>
            {label}
          </Link>
        ))}
      </div>
      {genres.length > 0 && (
        <div className="chips">
          <Link href={link(format, null)} className="chip" aria-current={!genre}>
            Alle Genres
          </Link>
          {genres.map((g) => (
            <Link key={g} href={link(format, g)} className="chip" aria-current={genre === g}>
              {g}
            </Link>
          ))}
        </div>
      )}

      {titles && titles.length > 0 ? (
        <div className="grid">
          {(titles as Title[]).map((t) => (
            <TitleCard key={t.id} t={t} />
          ))}
        </div>
      ) : (
        <div className="empty">
          {genreRows && genreRows.length === 0
            ? "Der Katalog ist noch leer. Ein Admin kann ihn unter „Katalog“ füllen."
            : "Hier ist nichts mehr übrig – du hast alles eingeordnet! Probier einen anderen Filter."}
        </div>
      )}
    </>
  );
}
