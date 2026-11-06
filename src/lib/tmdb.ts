// Alles, was mit der Filmdatenbank TMDB zu tun hat.
// Hinweis: "This product uses the TMDB API but is not endorsed or certified by TMDB."

const BASE = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p";

export type MediaType = "movie" | "tv";

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = process.env.TMDB_READ_TOKEN?.trim();
  if (!token) throw new Error("TMDB_READ_TOKEN fehlt in den Einstellungen.");
  const url = new URL(BASE + path);
  url.searchParams.set("language", "de-DE");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TMDB-Fehler ${res.status} bei ${path}`);
  return res.json() as Promise<T>;
}

type ListItem = { id: number };
type ListResult = { results: ListItem[]; total_pages: number };

// Listen, aus denen der Startkatalog gefüllt wird.
export const IMPORT_LISTS = {
  "movie-popular": { label: "Beliebte Filme", type: "movie", path: "/movie/popular" },
  "movie-top": { label: "Bestbewertete Filme", type: "movie", path: "/movie/top_rated" },
  "tv-popular": { label: "Beliebte Serien", type: "tv", path: "/tv/popular" },
  "tv-top": { label: "Bestbewertete Serien", type: "tv", path: "/tv/top_rated" },
} as const satisfies Record<string, { label: string; type: MediaType; path: string }>;

export type ImportListKey = keyof typeof IMPORT_LISTS;

export async function fetchListIds(key: ImportListKey, page: number) {
  const list = IMPORT_LISTS[key];
  const data = await tmdb<ListResult>(list.path, { page: String(page) });
  return { type: list.type as MediaType, ids: data.results.map((r) => r.id) };
}

type SearchResult = {
  results: {
    id: number;
    media_type: string;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
  }[];
};

// Live-Suche bei TMDB (für Titel, die noch nicht im Katalog sind).
export async function searchTmdb(query: string) {
  const data = await tmdb<SearchResult>("/search/multi", { query, include_adult: "false" });
  return data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 12)
    .map((r) => ({
      tmdb_id: r.id,
      media_type: r.media_type as MediaType,
      title: r.title ?? r.name ?? "Unbekannt",
      year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4) || null,
      poster_path: r.poster_path ?? null,
    }));
}

type Details = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  genres?: { name: string }[];
  original_language?: string;
  production_countries?: { iso_3166_1: string }[];
  origin_country?: string[];
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  type?: string;
  overview?: string;
  poster_path?: string | null;
  popularity?: number;
  last_episode_to_air?: { runtime?: number | null } | null;
};

const SERIES_STATUS: Record<string, string> = {
  "Returning Series": "laufend",
  "In Production": "laufend",
  Planned: "angekündigt",
  Ended: "abgeschlossen",
  Canceled: "abgesetzt",
  Cancelled: "abgesetzt",
};

// Holt die Details zu einem Titel und übersetzt sie in unser Datenformat (M001–M010).
export async function fetchTitleRow(type: MediaType, id: number) {
  const d = await tmdb<Details>(`/${type}/${id}`);
  const dateStr = type === "movie" ? d.release_date : d.first_air_date;
  const year = dateStr ? Number(dateStr.slice(0, 4)) : null;

  let runtimeMin: number | null = null;
  if (type === "movie") runtimeMin = d.runtime || null;
  else runtimeMin = d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || null;

  let format: string;
  if (type === "movie") format = "Film";
  else format = d.type === "Miniseries" ? "Miniserie" : "Serie";

  return {
    media_type: type,
    tmdb_id: d.id,
    title: (type === "movie" ? d.title : d.name) || "Unbekannt",
    original_title: (type === "movie" ? d.original_title : d.original_name) ?? null,
    format,
    release_year: year && !Number.isNaN(year) ? year : null,
    genres: (d.genres ?? []).map((g) => g.name),
    original_language: d.original_language ?? null,
    countries:
      type === "movie"
        ? (d.production_countries ?? []).map((c) => c.iso_3166_1)
        : (d.origin_country ?? []),
    runtime_seconds: runtimeMin ? runtimeMin * 60 : null,
    seasons: type === "tv" ? (d.number_of_seasons ?? null) : null,
    episodes: type === "tv" ? (d.number_of_episodes ?? null) : null,
    series_status: type === "tv" ? (SERIES_STATUS[d.status ?? ""] ?? "unbekannt") : null,
    overview: d.overview || null,
    poster_path: d.poster_path ?? null,
    popularity: d.popularity ?? null,
    metadata_source: "tmdb",
    fetched_at: new Date().toISOString(),
  };
}

// Führt viele Abrufe gleichzeitig aus, aber höchstens `limit` auf einmal.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>) {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    out.push(...(await Promise.allSettled(chunk.map(fn))));
  }
  return out;
}
