import { notFound } from "next/navigation";
import Poster from "@/components/Poster";
import TitleCard from "@/components/TitleCard";
import FeedbackControls from "@/components/FeedbackControls";
import { createClient, getUser } from "@/lib/supabase/server";
import { awardDe, formatRuntime, formatUsd, formatVotes, type Status, type Title } from "@/lib/types";

// Detailseite eines Films oder einer Serie.
export default async function TitlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const titleId = Number(id);
  if (!Number.isInteger(titleId)) notFound();

  const supabase = await createClient();
  const user = await getUser();
  const [{ data: t }, { data: fb }] = await Promise.all([
    supabase.from("titles").select("*").eq("id", titleId).maybeSingle(),
    supabase
      .from("user_title_feedback")
      .select("*") // inkl. favorite, falls Ergänzung 16 schon da ist
      .eq("user_id", user!.id)
      .eq("title_id", titleId)
      .maybeSingle(),
  ]);
  if (!t) notFound();
  const title = t as Title;

  // Andere Teile derselben Filmreihe (falls im Katalog)
  const { data: siblings } = title.collection_id
    ? await supabase
        .from("titles")
        .select("id,title,poster_path,release_year,format")
        .eq("collection_id", title.collection_id)
        .neq("id", title.id)
        .order("release_year", { ascending: true })
    : { data: null };

  const runtime = formatRuntime(title.runtime_seconds);
  const facts = [
    title.format,
    title.release_year,
    runtime && (title.media_type === "tv" ? `ca. ${runtime} pro Folge` : runtime),
    title.seasons != null && `${title.seasons} Staffel${title.seasons === 1 ? "" : "n"}`,
    title.episodes != null && `${title.episodes} Folgen`,
    title.series_status && title.series_status !== "unbekannt" && title.series_status,
    title.original_language?.toUpperCase(),
    formatVotes(title.vote_average, title.vote_count) && `TMDB ${formatVotes(title.vote_average, title.vote_count)}`,
    title.certification_de && `FSK ${title.certification_de}`,
    title.black_and_white && "Schwarzweiß",
    title.countries.length > 0 && title.countries.join(", "),
  ].filter(Boolean);

  return (
    <div className="detail">
      <Poster path={title.poster_path} title={title.title} size="w500" />
      <div>
        <h1>{title.title}</h1>
        {title.original_title && title.original_title !== title.title && (
          <div className="muted small">Originaltitel: {title.original_title}</div>
        )}
        <div className="facts">
          {facts.map((f, i) => (
            <span key={i}>{f}</span>
          ))}
        </div>
        {title.genres.length > 0 && (
          <div className="tags">
            {title.genres.map((g) => (
              <span key={g} className="tag">{g}</span>
            ))}
          </div>
        )}
        {title.directors && title.directors.length > 0 && (
          <div className="small" style={{ marginBottom: 4 }}>
            <span className="muted">{title.media_type === "tv" ? "Erdacht von" : "Regie"}: </span>
            {title.directors.join(", ")}
          </div>
        )}
        {title.cast_names && title.cast_names.length > 0 && (
          <div className="small" style={{ marginBottom: 4 }}>
            <span className="muted">Mit: </span>
            {title.cast_names.slice(0, 6).join(", ")}
          </div>
        )}
        {[
          ["Drehbuch", title.writers],
          ["Kamera", title.cinematographers],
          ["Musik", title.composers],
        ].map(([label, list]) =>
          Array.isArray(list) && list.length > 0 ? (
            <div key={label as string} className="small" style={{ marginBottom: 4 }}>
              <span className="muted">{label as string}: </span>{(list as string[]).join(", ")}
            </div>
          ) : null,
        )}
        {title.studios && title.studios.length > 0 && (
          <div className="small" style={{ marginBottom: 10 }}>
            <span className="muted">Studios: </span>
            {title.studios.slice(0, 4).join(", ")}
          </div>
        )}
        {((title.oscars?.length ?? 0) > 0 || (title.globes?.length ?? 0) > 0) && (
          <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
            {(title.oscars?.length ?? 0) > 0 && (
              <div className="small" style={{ marginBottom: 4 }}>
                🏆 <strong>{title.oscars!.length} Oscar{title.oscars!.length > 1 ? "s" : ""}:</strong>{" "}
                <span className="muted">{title.oscars!.map(awardDe).join(", ")}</span>
              </div>
            )}
            {(title.globes?.length ?? 0) > 0 && (
              <div className="small">
                🌐 <strong>{title.globes!.length} Golden Globe{title.globes!.length > 1 ? "s" : ""}:</strong>{" "}
                <span className="muted">{title.globes!.map(awardDe).join(", ")}</span>
              </div>
            )}
          </div>
        )}
        {((title.festivals?.length ?? 0) > 0 || (title.canon?.length ?? 0) > 0) && (
          <div className="small" style={{ marginBottom: 12 }}>
            {(title.festivals?.length ?? 0) > 0 && <div>🎖 {title.festivals!.join(", ")}</div>}
            {(title.canon?.length ?? 0) > 0 && <div className="muted">📚 {title.canon!.join(", ")}</div>}
          </div>
        )}
        {(title.nominations?.length ?? 0) > 0 && (
          <details className="small" style={{ marginBottom: 12 }}>
            <summary style={{ cursor: "pointer" }}>
              🎟 <strong>{title.nominations!.length}{title.nominations!.length >= 25 ? "+" : ""} Nominierungen</strong> <span className="muted">anzeigen ›</span>
            </summary>
            <div className="muted" style={{ marginTop: 6 }}>{title.nominations!.join(" · ")}</div>
          </details>
        )}
        {title.overview && <p style={{ lineHeight: 1.55 }}>{title.overview}</p>}

        {(title.based_on?.length || title.set_in_period?.length || title.narrative_locations?.length || title.main_subjects?.length || title.filming_locations?.length || title.budget_usd || title.box_office_usd) ? (
          <div className="small" style={{ display: "grid", gap: 4, marginBottom: 14 }}>
            {(title.based_on?.length ?? 0) > 0 && <div><span className="muted">Basiert auf: </span>{title.based_on!.join(", ")}</div>}
            {(title.set_in_period?.length ?? 0) > 0 && <div><span className="muted">Spielt: </span>{title.set_in_period!.join(", ")}</div>}
            {(title.narrative_locations?.length ?? 0) > 0 && <div><span className="muted">Ort: </span>{title.narrative_locations!.join(", ")}</div>}
            {(title.main_subjects?.length ?? 0) > 0 && <div><span className="muted">Themen: </span>{title.main_subjects!.map((x) => x.replace(/^Person: /, "")).join(", ")}</div>}
            {(title.filming_locations?.length ?? 0) > 0 && <div><span className="muted">Gedreht in: </span>{title.filming_locations!.join(", ")}</div>}
            {(title.budget_usd || title.box_office_usd) && (
              <div>
                {title.budget_usd ? <><span className="muted">Budget: </span>{formatUsd(title.budget_usd)}</> : null}
                {title.budget_usd && title.box_office_usd ? " · " : null}
                {title.box_office_usd ? <><span className="muted">Einspiel: </span>{formatUsd(title.box_office_usd)}</> : null}
              </div>
            )}
          </div>
        ) : null}
        {((title.wd_genres?.length ?? 0) > 0 || (title.keywords?.length ?? 0) > 0) && (
          <details style={{ marginBottom: 14 }}>
            <summary className="caption" style={{ cursor: "pointer" }}>Stichworte & feine Genres ›</summary>
            <div className="tags" style={{ marginTop: 8 }}>
              {(title.wd_genres ?? []).map((g) => <span key={"g" + g} className="tag">{g}</span>)}
              {(title.keywords ?? []).slice(0, 25).map((k) => <span key={"k" + k} className="tag" style={{ opacity: 0.8 }}>{k}</span>)}
            </div>
          </details>
        )}

        <FeedbackControls
          titleId={title.id}
          initialStatus={(fb?.status as Status) ?? null}
          initialRating={fb?.rating ?? null}
          initialFavorite={!!(fb as { favorite?: boolean } | null)?.favorite}
          title={title.title}
          info={{ directors: title.directors, cast_names: title.cast_names?.slice(0, 3), genres: title.genres, wd_genres: title.wd_genres,
            composers: title.composers?.slice(0, 1), cinematographers: title.cinematographers?.slice(0, 1), based_on: title.based_on,
            writers: title.writers?.slice(0, 1), keywords: title.keywords?.slice(0, 15), main_subjects: title.main_subjects,
            set_in_period: title.set_in_period, narrative_locations: title.narrative_locations, runtime_seconds: title.runtime_seconds,
            certification_de: title.certification_de, collection_name: title.collection_name }}
        />

        {title.collection_name && (
          <div style={{ marginTop: 22 }}>
            <h2>Teil der Reihe: {title.collection_name}</h2>
            {siblings && siblings.length > 0 ? (
              <div className="grid">
                {(siblings as Title[]).map((s) => (
                  <TitleCard key={s.id} t={s} />
                ))}
              </div>
            ) : (
              <p className="muted small">Die anderen Teile sind noch nicht im Katalog.</p>
            )}
          </div>
        )}

        <p className="muted small" style={{ marginTop: 16 }}>
          Die tiefen Merkmale (Stimmung, Komplexität, Humor …) kommen in Stufe 2.
        </p>
      </div>
    </div>
  );
}
