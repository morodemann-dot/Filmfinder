import { notFound } from "next/navigation";
import Poster from "@/components/Poster";
import FeedbackControls from "@/components/FeedbackControls";
import { createClient, getUser } from "@/lib/supabase/server";
import { formatRuntime, type Status, type Title } from "@/lib/types";

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

  const runtime = formatRuntime(title.runtime_seconds);
  const facts = [
    title.format,
    title.release_year,
    runtime && (title.media_type === "tv" ? `ca. ${runtime} pro Folge` : runtime),
    title.seasons != null && `${title.seasons} Staffel${title.seasons === 1 ? "" : "n"}`,
    title.episodes != null && `${title.episodes} Folgen`,
    title.series_status && title.series_status !== "unbekannt" && title.series_status,
    title.original_language?.toUpperCase(),
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
        {title.overview && <p style={{ lineHeight: 1.55 }}>{title.overview}</p>}

        <FeedbackControls
          titleId={title.id}
          initialStatus={(fb?.status as Status) ?? null}
          initialRating={fb?.rating ?? null}
        />

        <p className="muted small" style={{ marginTop: 16 }}>
          Die tiefen Merkmale (Stimmung, Komplexität, Humor …) kommen in Stufe 2.
        </p>
      </div>
    </div>
  );
}
