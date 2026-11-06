import { notFound } from "next/navigation";
import Poster from "@/components/Poster";
import TitleCard from "@/components/TitleCard";
import FeedbackControls from "@/components/FeedbackControls";
import { createClient, getUser } from "@/lib/supabase/server";
import { awardDe, formatRuntime, formatVotes, type Status, type Title } from "@/lib/types";

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
      .select("status,rating")
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
        {title.overview && <p style={{ lineHeight: 1.55 }}>{title.overview}</p>}

        <FeedbackControls
          titleId={title.id}
          initialStatus={(fb?.status as Status) ?? null}
          initialRating={fb?.rating ?? null}
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
