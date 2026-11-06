export type Title = {
  id: number;
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  original_title: string | null;
  format: string | null;
  release_year: number | null;
  genres: string[];
  original_language: string | null;
  countries: string[];
  runtime_seconds: number | null;
  seasons: number | null;
  episodes: number | null;
  series_status: string | null;
  overview: string | null;
  poster_path: string | null;
  popularity: number | null;
  directors: string[] | null;
  studios: string[] | null;
  collection_id: number | null;
  collection_name: string | null;
};

export type Status = "merkliste" | "gesehen" | "nicht_gesehen" | "nicht_interessiert";

export type Feedback = {
  title_id: number;
  status: Status;
  rating: number | null;
};

export const STATUS_LABEL: Record<Status, string> = {
  merkliste: "Merkliste",
  gesehen: "Gesehen",
  nicht_gesehen: "Nicht gesehen",
  nicht_interessiert: "Kein Interesse",
};

export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function formatRuntime(seconds: number | null) {
  if (!seconds) return null;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

export function formatStars(rating: number | null) {
  if (!rating) return null;
  return (rating / 2).toLocaleString("de-DE") + " ★";
}
