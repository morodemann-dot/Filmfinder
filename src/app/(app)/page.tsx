import Link from "next/link";
import Poster from "@/components/Poster";
import PickDeck, { type Pick } from "@/components/PickDeck";
import { createClient, getUser } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { buildProfile, recommend, topPreferences, type RatedTitle, type Recommendation } from "@/lib/recommend";
import { MOODS, TIMES, matchesMood, matchesTime, type TimeKey } from "@/lib/moods";
import { formatRuntime, type Title } from "@/lib/types";

// Startseite "Filmfinder": erst die Stimmung wählen, dann gibt's einen klaren Tipp + ein paar Alternativen.

const COLS =
  "id,media_type,title,poster_path,release_year,format,genres,directors,cast_names,studios,collection_id,collection_name,oscars,globes,popularity,runtime_seconds";
const MIN_RATINGS = 10;

type SP = { stimmung?: string; zeit?: string; modus?: string };

function href(sp: SP, change: Partial<SP>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...change })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

function Tile({ r }: { r: Recommendation }) {
  const t = r.title;
  return (
    <Link href={`/titel/${t.id}`} className="card">
      <Poster path={t.poster_path} title={t.title} size="w185" />
      <div className="card-title">{t.title}</div>
      <div className="card-meta">{r.reasons[0]?.replace(/ \(.*\)$/, "") ?? t.release_year}</div>
    </Link>
  );
}

export default async function FilmfinderPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const mood = MOODS.find((m) => m.key === sp.stimmung) ?? null;
  const time = (sp.zeit && sp.zeit in TIMES ? sp.zeit : "egal") as TimeKey;
  const surprise = sp.modus === "ueberrasch";

  const supabase = await createClient();
  const user = await getUser();
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
        <h1>Was soll es heute werden?</h1>
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

  // Kandidaten: ungesehen + passend zu Stimmung und Zeit
  const pops = catalog.map((t) => t.popularity ?? 0).sort((a, b) => a - b);
  const medianPop = pops[Math.floor(pops.length / 2)] ?? 0;
  const candidates = catalog.filter(
    (t) => !seen.has(t.id) && (!mood || matchesMood(t, mood)) && matchesTime(t, time) &&
      (!surprise || (t.popularity ?? 0) < medianPop),
  );
  const recs = recommend(candidates, prefs).filter((r) => r.score > 0.1 && r.reasons.length > 0);
  const DECK = 25; // so viele Vorschläge liegen im Stapel
  const picks: Pick[] = recs.slice(0, DECK).map((r) => ({
    id: r.title.id,
    title: r.title.title,
    poster_path: r.title.poster_path,
    meta: [r.title.release_year, formatRuntime(r.title.runtime_seconds), r.title.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · "),
    reasons: r.reasons,
  }));
  const more = recs.slice(DECK, DECK + 12);
  const learned = topPreferences(prefs, 8);

  return (
    <>
      <h1>Was soll es heute werden?</h1>

      <div className="moods">
        {MOODS.map((m) => {
          const on = mood?.key === m.key;
          return (
            <Link key={m.key} href={href(sp, { stimmung: on ? undefined : m.key })} className={`mood ${on ? "on" : ""}`}
              style={{ ["--tint" as string]: m.tint }} aria-current={on}>
              <span className="mood-label">{m.label}</span>
              <span className="mood-hint">{m.hint}</span>
            </Link>
          );
        })}
      </div>

      <div className="toolbar" style={{ marginTop: 14 }}>
        <div className="segmented" style={{ minWidth: 260 }}>
          <Link href={href(sp, { modus: undefined })} aria-pressed={!surprise} className="seg-link">Sichere Wahl</Link>
          <Link href={href(sp, { modus: "ueberrasch" })} aria-pressed={surprise} className="seg-link">Überrasch mich</Link>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {(Object.keys(TIMES) as TimeKey[]).map((k) => (
            <Link key={k} href={href(sp, { zeit: k === "egal" ? undefined : k })}
              className={`pill ${time === k ? "on" : ""}`}>{TIMES[k].label}</Link>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {picks.length > 0 ? (
          <>
            <PickDeck picks={picks} />
            {more.length > 0 && (
              <>
                <h2 className="section">Weitere Ideen</h2>
                <div className="grid">{more.map((r) => <Tile key={r.title.id} r={r} />)}</div>
              </>
            )}
          </>
        ) : (
          <div className="empty">
            Dafür haben wir gerade nichts Passendes im Katalog. Probier eine andere Stimmung oder Länge
            {surprise ? " – oder „Sichere Wahl“" : ""}.
          </div>
        )}
      </div>

      <details className="panel" style={{ marginTop: 28 }}>
        <summary className="eyebrow" style={{ cursor: "pointer" }}>Was die App über dich gelernt hat</summary>
        <p className="caption">
          Basierend auf {ratedCount} Bewertungen. Bisher berücksichtigt: Genre, Regie, Besetzung, Filmreihen und Preise.
          Stimmungen beruhen vorerst auf Genres – mit Stufe 2 (KI-Merkmale wie Grundstimmung, Spannung, Humor) werden sie genauer.
        </p>
        <div className="tags" style={{ marginBottom: 0 }}>
          {learned.map((p) => (
            <span key={p.key} className="tag">
              {p.label} · {p.n} Filme · Ø {p.avgScore?.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
            </span>
          ))}
        </div>
      </details>
    </>
  );
}
