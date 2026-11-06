import Link from "next/link";
import Poster from "@/components/Poster";
import { createClient, getUser } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { buildProfile, recommend, topPreferences, type RatedTitle, type Recommendation } from "@/lib/recommend";
import type { Title } from "@/lib/types";

const COLS =
  "id,media_type,title,poster_path,release_year,format,genres,directors,cast_names,studios,collection_id,collection_name,oscars,globes,popularity";
const MIN_RATINGS = 10;

function RecCard({ r }: { r: Recommendation }) {
  const t = r.title;
  return (
    <Link href={`/titel/${t.id}`} className="rec">
      <div className="rec-poster">
        <Poster path={t.poster_path} title={t.title} size="w185" />
      </div>
      <div>
        <div className="rec-title">{t.title}</div>
        <div className="caption">{[t.release_year, t.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</div>
        {r.reasons.length > 0 && (
          <ul className="reasons">
            {r.reasons.map((x) => <li key={x}>{x}</li>)}
          </ul>
        )}
        {r.coverage < 0.4 && <div className="caption">Noch wenig Daten zu diesem Film – eher unsicher.</div>}
      </div>
    </Link>
  );
}

export default async function ForYouPage() {
  const supabase = await createClient();
  const user = await getUser();

  // Deine Einträge (mit Filmdaten) und der ganze Katalog
  const [mine, catalog] = await Promise.all([
    fetchAll<{ status: string; rating: number | null; titles: Title | null }>((from, to) =>
      supabase.from("user_title_feedback").select(`status,rating,titles(${COLS})`).eq("user_id", user!.id).range(from, to),
    ),
    fetchAll<Title>((from, to) => supabase.from("titles").select(COLS).eq("media_type", "movie").range(from, to)),
  ]);

  const rated: RatedTitle[] = mine.filter((m) => m.titles).map((m) => ({ ...m.titles!, rating: m.rating, status: m.status }));
  const seen = new Set(rated.map((r) => r.id));
  const { prefs, ratedCount } = buildProfile(rated);

  if (ratedCount < MIN_RATINGS) {
    return (
      <>
        <h1>Für dich</h1>
        <div className="empty">
          <p>
            Damit die App deinen Geschmack erkennen kann, bewerte bitte mindestens <strong>{MIN_RATINGS} Filme</strong>
            {" "}(bisher: {ratedCount}).
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/bewerten" className="btn primary">Jetzt bewerten</Link>
            <Link href="/imdb" className="btn">IMDb importieren</Link>
          </div>
        </div>
      </>
    );
  }

  const recs = recommend(catalog.filter((t) => !seen.has(t.id)), prefs).filter((r) => r.score > 0.1 && r.reasons.length > 0);
  const top = recs.slice(0, 30);
  const topIds = new Set(top.map((r) => r.title.id));

  // Entdeckungen: passen zu dir, sind aber weniger bekannt
  const pops = catalog.map((t) => t.popularity ?? 0).sort((a, b) => a - b);
  const medianPop = pops[Math.floor(pops.length / 2)] ?? 0;
  const discoveries = recs
    .filter((r) => !topIds.has(r.title.id) && (r.title.popularity ?? 0) < medianPop && r.reasons.length > 0)
    .slice(0, 20);

  const learned = topPreferences(prefs);

  return (
    <>
      <h1>Für dich</h1>
      <p className="caption" style={{ marginTop: -4 }}>
        Basierend auf {ratedCount} Bewertungen. Version 1 – nutzt Genre, Regie, Besetzung, Filmreihen und Preise.
        Mit Stufe 2 kommen Stimmung, Komplexität, Humor & Co. dazu.
      </p>

      {learned.length > 0 && (
        <div className="panel" style={{ margin: "14px 0 22px" }}>
          <div className="eyebrow">Was die App über dich gelernt hat</div>
          <div className="tags" style={{ marginTop: 8, marginBottom: 0 }}>
            {learned.map((p) => (
              <span key={p.key} className="tag">
                {p.label} · {p.n} Filme · Ø {p.avgStars?.toLocaleString("de-DE", { maximumFractionDigits: 1 })}★
              </span>
            ))}
          </div>
        </div>
      )}

      <h2 className="section">Deine Top-Treffer</h2>
      {top.length ? (
        <div className="rec-list">{top.map((r) => <RecCard key={r.title.id} r={r} />)}</div>
      ) : (
        <p className="caption">Noch keine passenden Filme gefunden – bewerte ein paar mehr oder erweitere den Katalog.</p>
      )}

      {discoveries.length > 0 && (
        <>
          <h2 className="section">Entdeckungen</h2>
          <p className="caption" style={{ marginTop: -6 }}>Weniger bekannt, aber mit klarer Verbindung zu deinem Geschmack.</p>
          <div className="rec-list">{discoveries.map((r) => <RecCard key={r.title.id} r={r} />)}</div>
        </>
      )}
    </>
  );
}
