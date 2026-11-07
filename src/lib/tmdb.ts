// Alles, was mit der Filmdatenbank TMDB zu tun hat.
// Hinweis: "This product uses the TMDB API but is not endorsed or certified by TMDB."

import awardsData from "@/data/awards.json";
import festivalData from "@/data/festivals.json";
import canonData from "@/data/canon.json";

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
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.status_message || (body.errors ? body.errors.join(", ") : "");
    } catch {}
    throw new Error(`TMDB-Fehler ${res.status} bei ${path}${detail ? `: ${detail}` : ""}`);
  }
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
  production_companies?: { id: number; name: string }[];
  credits?: { crew?: { job: string; department?: string; name: string }[]; cast?: { name: string; order: number }[] };
  keywords?: { keywords?: { name: string }[]; results?: { name: string }[] };
  release_dates?: { results?: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  created_by?: { name: string }[];
  belongs_to_collection?: { id: number; name: string } | null;
  imdb_id?: string | null;
  vote_average?: number;
  vote_count?: number;
};

const SERIES_STATUS: Record<string, string> = {
  "Returning Series": "laufend",
  "In Production": "laufend",
  Planned: "angekündigt",
  Ended: "abgeschlossen",
  Canceled: "abgesetzt",
  Cancelled: "abgesetzt",
};

// Oscar- und Golden-Globe-Gewinner seit 1980 (Quelle: Wikidata, CC0).
export type AwardFilm = { tmdb: number; imdb: string | null; year: number | null; oscars: string[]; globes: string[] };
export const AWARD_FILMS = awardsData as AwardFilm[];
const AWARDS_BY_TMDB = new Map(AWARD_FILMS.map((a) => [a.tmdb, a]));

// Festival- und BAFTA-Gewinner seit 1980 sowie Kritiker-Kanon (Criterion Collection, National Film Registry).
// Quelle: Wikidata (CC0).
export type FestivalFilm = { tmdb: number; year: number | null; awards: string[] };
export type CanonFilm = { tmdb: number; year: number | null; lists: string[] };
export const FESTIVAL_FILMS = festivalData as FestivalFilm[];
export const CANON_FILMS = canonData as CanonFilm[];
const FESTIVALS_BY_TMDB = new Map(FESTIVAL_FILMS.map((a) => [a.tmdb, a.awards]));
const CANON_BY_TMDB = new Map(CANON_FILMS.map((a) => [a.tmdb, a.lists]));
export function isShortOnly(a: AwardFilm) {
  return a.globes.length === 0 && a.oscars.length > 0 && a.oscars.every((o) => /short/i.test(o));
}

// Holt die Details zu einem Titel und übersetzt sie in unser Datenformat (M001–M010).
export async function fetchTitleRow(type: MediaType, id: number) {
  const d = await tmdb<Details>(`/${type}/${id}`, {
    append_to_response: type === "movie" ? "credits,keywords,release_dates" : "credits,keywords",
  });
  const crew = d.credits?.crew ?? [];
  const names = (pred: (c: { job: string; department?: string }) => boolean, max = 4) =>
    [...new Set(crew.filter(pred).map((c) => c.name))].slice(0, max);
  // FSK-Freigabe für Deutschland (z. B. "12")
  const fsk =
    d.release_dates?.results?.find((r) => r.iso_3166_1 === "DE")?.release_dates.map((x) => x.certification).find((c) => c) ?? null;
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
    vote_average: d.vote_average ?? null,
    vote_count: d.vote_count ?? null,
    directors:
      type === "movie"
        ? [...new Set((d.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.name))]
        : (d.created_by ?? []).map((c) => c.name),
    studios: (d.production_companies ?? []).map((c) => c.name),
    cast_names: (d.credits?.cast ?? []).sort((a, b) => a.order - b.order).slice(0, 8).map((c) => c.name),
    // Weitere Köpfe hinter dem Film
    writers: names((c) => c.department === "Writing" || ["Screenplay", "Writer", "Story", "Novel"].includes(c.job)),
    cinematographers: names((c) => c.job === "Director of Photography", 2),
    composers: names((c) => c.job === "Original Music Composer" || c.job === "Music", 2),
    // Stichworte (englisch), z. B. "twist ending", "dystopia"
    keywords: (d.keywords?.keywords ?? d.keywords?.results ?? []).map((k) => k.name).slice(0, 40),
    certification_de: type === "movie" ? fsk : null,
    collection_id: type === "movie" ? (d.belongs_to_collection?.id ?? null) : null,
    collection_name: type === "movie" ? (d.belongs_to_collection?.name ?? null) : null,
    imdb_id: type === "movie" ? (d.imdb_id ?? null) : null,
    oscars: type === "movie" ? (AWARDS_BY_TMDB.get(d.id)?.oscars ?? []) : [],
    globes: type === "movie" ? (AWARDS_BY_TMDB.get(d.id)?.globes ?? []) : [],
    festivals: type === "movie" ? (FESTIVALS_BY_TMDB.get(d.id) ?? []) : [],
    canon: type === "movie" ? (CANON_BY_TMDB.get(d.id) ?? []) : [],
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

// ---------------- Kuratierter Import ----------------

// Netflix-Produktionen erkennen (anhand der Produktionsfirmen).
export function isNetflix(studios: string[]) {
  return studios.some((s) => /netflix/i.test(s));
}

// Große/bekannte Hollywood-Studios (Namensmuster, wie sie bei TMDB stehen).
const MAJOR_STUDIO_PATTERNS = [
  /warner bros/i, /universal pictures/i, /paramount/i, /columbia pictures/i, /sony pictures/i, /tristar/i,
  /20th century/i, /twentieth century/i, /walt disney/i, /disney/i, /pixar/i, /lucasfilm/i, /marvel studios/i,
  /dreamworks/i, /new line/i, /metro-goldwyn|mgm/i, /lionsgate|lions gate/i, /miramax/i, /a24/i,
  /legendary/i, /focus features/i, /searchlight/i, /amblin/i, /orion pictures/i, /summit entertainment/i,
  /touchstone/i, /village roadshow/i, /regency/i, /blumhouse/i, /castle rock/i, /carolco/i,
  /united artists/i, /annapurna/i, /plan b/i, /skydance/i, /working title/i, /imagine entertainment/i,
];
export function hasMajorStudio(studios: string[]) {
  return studios.some((s) => MAJOR_STUDIO_PATTERNS.some((re) => re.test(s)));
}

export const DECADES = {
  "1980": { label: "1980er", from: "1980-01-01", to: "1989-12-31" },
  "1990": { label: "1990er", from: "1990-01-01", to: "1999-12-31" },
  "2000": { label: "2000er", from: "2000-01-01", to: "2009-12-31" },
  "2010": { label: "2010er", from: "2010-01-01", to: "2019-12-31" },
  "2020": { label: "2020 bis heute", from: "2020-01-01", to: "2099-12-31" },
} as const;
export type DecadeKey = keyof typeof DECADES;

type DiscoverResult = { results: { id: number }[]; total_pages: number; total_results: number };

// US-Filme eines Jahrzehnts, sortiert nach Anzahl der Bewertungen (= Bekanntheit).
export async function discoverHollywood(decade: DecadeKey, minVotes: number, page: number) {
  const d = DECADES[decade];
  const data = await tmdb<DiscoverResult>("/discover/movie", {
    with_origin_country: "US",
    with_original_language: "en",
    "primary_release_date.gte": d.from,
    "primary_release_date.lte": d.to,
    "vote_count.gte": String(minVotes),
    sort_by: "vote_count.desc",
    include_adult: "false",
    page: String(page),
  });
  return { ids: data.results.map((r) => r.id), totalPages: data.total_pages, total: data.total_results };
}

type PersonSearch = { results: { id: number; name: string; known_for_department?: string }[] };
type MovieCredits = {
  crew: { id: number; job: string; release_date?: string; vote_count?: number }[];
};

// Sucht eine Regie-Person und liefert ihre Filme ab 1980.
export async function directorMovies(name: string, minVotes: number) {
  const s = await tmdb<PersonSearch>("/search/person", { query: name.normalize("NFC").replace(/\s+/g, " ").trim() });
  const person = s.results.find((p) => p.known_for_department === "Directing") ?? s.results[0];
  if (!person) return null;
  const c = await tmdb<MovieCredits>(`/person/${person.id}/movie_credits`);
  const ids = [
    ...new Set(
      c.crew
        .filter((m) => m.job === "Director")
        .filter((m) => (m.release_date ?? "") >= "1980-01-01")
        .filter((m) => (m.vote_count ?? 0) >= minVotes)
        .map((m) => m.id),
    ),
  ];
  return { person: person.name, ids };
}

// ---------------- Filmreihen & Franchises ----------------

type Part = { id: number; release_date?: string; vote_count?: number };
type Collection = { id: number; name: string; parts: Part[] };

const today = () => new Date().toISOString().slice(0, 10);

// Nur bereits erschienene, halbwegs bekannte Teile (keine Kurzfilme/Ankündigungen).
function usableParts(parts: Part[], minVotes = 50) {
  return parts
    .filter((p) => p.release_date && p.release_date <= today())
    .filter((p) => (p.vote_count ?? 0) >= minVotes)
    .map((p) => p.id);
}

// Alle Teile einer Filmreihe.
export async function collectionParts(id: number) {
  const c = await tmdb<Collection>(`/collection/${id}`);
  return { name: c.name, ids: usableParts(c.parts ?? []) };
}

// Sucht Filmreihen, deren Name den Suchbegriff enthält (z. B. "Spider-Man" -> 4 Reihen).
export async function searchCollections(query: string) {
  const r = await tmdb<{ results: { id: number; name: string }[] }>("/search/collection", { query });
  const q = query.toLowerCase();
  const matching = r.results.filter((c) => c.name.toLowerCase().includes(q));
  return (matching.length ? matching : r.results.slice(0, 3)).slice(0, 10);
}

// Stichwort-Suche (für Universen wie "Marvel Cinematic Universe").
export async function keywordMovies(query: string, minVotes: number) {
  const r = await tmdb<{ results: { id: number; name: string }[] }>("/search/keyword", { query });
  const q = query.toLowerCase();
  const kw = r.results.find((k) => k.name.toLowerCase() === q) ?? r.results.find((k) => k.name.toLowerCase().includes(q));
  if (!kw) return null;
  const ids: number[] = [];
  for (let page = 1; page <= 4; page++) {
    const d = await tmdb<DiscoverResult>("/discover/movie", {
      with_keywords: String(kw.id),
      "vote_count.gte": String(minVotes),
      "primary_release_date.lte": today(),
      sort_by: "vote_count.desc",
      include_adult: "false",
      page: String(page),
    });
    ids.push(...d.results.map((x) => x.id));
    if (page >= d.total_pages) break;
  }
  return { keyword: kw.name, ids };
}

// IMDb-ID (z. B. tt0111161) in eine TMDB-Film-ID übersetzen.
export async function tmdbIdFromImdb(imdbId: string) {
  const r = await tmdb<{ movie_results: { id: number }[] }>(`/find/${imdbId}`, { external_source: "imdb_id" });
  return r.movie_results[0]?.id ?? null;
}

type CastCredits = {
  cast: { id: number; release_date?: string; vote_count?: number; order?: number; character?: string; genre_ids?: number[] }[];
};

// Sucht eine Schauspielerin / einen Schauspieler und liefert ihre/seine Filme ab 1980.
// onlyLead = nur Rollen weit vorne in der Besetzungsliste (Haupt- und große Nebenrollen).
export async function actorMovies(name: string, minVotes: number, onlyLead: boolean) {
  const s = await tmdb<PersonSearch>("/search/person", { query: name.normalize("NFC").replace(/\s+/g, " ").trim() });
  const person = s.results.find((p) => p.known_for_department === "Acting") ?? s.results[0];
  if (!person) return null;
  const c = await tmdb<CastCredits>(`/person/${person.id}/movie_credits`);
  const ids = [
    ...new Set(
      c.cast
        .filter((m) => (m.release_date ?? "") >= "1980-01-01" && (m.release_date ?? "") <= today())
        .filter((m) => (m.vote_count ?? 0) >= minVotes)
        .filter((m) => !/\b(himself|herself|self|narrator|voice)\b/i.test(m.character ?? ""))
        .filter((m) => !(m.genre_ids ?? []).includes(99)) // keine Dokumentationen
        .filter((m) => !onlyLead || (m.order ?? 99) <= 4)
        .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
        .map((m) => m.id),
    ),
  ];
  return { person: person.name, ids };
}

// ---------------- Weitere Quellen ----------------

// TMDB-Filmgenres (feste IDs, deutsche Namen)
export const MOVIE_GENRES: Record<number, string> = {
  28: "Action", 12: "Abenteuer", 16: "Animation", 35: "Komödie", 80: "Krimi", 99: "Dokumentarfilm",
  18: "Drama", 10751: "Familie", 14: "Fantasy", 36: "Historie", 27: "Horror", 10402: "Musik",
  9648: "Mystery", 10749: "Liebesfilm", 878: "Science Fiction", 53: "Thriller", 10752: "Kriegsfilm", 37: "Western",
};

// Beste Filme nach Kriterien (sortiert nach Bewertung, nicht nach Beliebtheit)
export async function discoverBest(p: {
  genre?: number; decade?: DecadeKey; keyword?: number; company?: number; region?: "west" | "welt";
  minRating: number; minVotes: number; page: number; sort?: "rating" | "votes";
}) {
  const params: Record<string, string> = {
    sort_by: p.sort === "votes" ? "vote_count.desc" : "vote_average.desc",
    "vote_count.gte": String(p.minVotes),
    "vote_average.gte": String(p.minRating),
    "primary_release_date.gte": p.decade ? DECADES[p.decade].from : "1980-01-01",
    "primary_release_date.lte": p.decade ? DECADES[p.decade].to : today(),
    include_adult: "false",
    page: String(p.page),
  };
  if (p.genre) params.with_genres = String(p.genre);
  if (p.keyword) params.with_keywords = String(p.keyword);
  if (p.company) params.with_companies = String(p.company);
  if (p.region === "west") params.with_origin_country = "US|GB|CA|AU|IE|NZ|FR|DE|ES|IT|DK|SE|NO";
  const d = await tmdb<DiscoverResult>("/discover/movie", params);
  return { ids: d.results.map((r) => r.id), totalPages: d.total_pages, total: d.total_results };
}

// Stichwort suchen (z. B. "heist", "time travel")
export async function findKeyword(query: string) {
  const r = await tmdb<{ results: { id: number; name: string }[] }>("/search/keyword", { query });
  const q = query.toLowerCase().trim();
  return r.results.find((k) => k.name.toLowerCase() === q) ?? r.results[0] ?? null;
}

// Produktionsfirma suchen (z. B. "A24")
export async function findCompany(query: string) {
  const r = await tmdb<{ results: { id: number; name: string; origin_country?: string }[] }>("/search/company", { query });
  const q = query.toLowerCase().trim();
  return r.results.find((c) => c.name.toLowerCase() === q) ?? r.results[0] ?? null;
}

// Von TMDB empfohlene ähnliche Filme
export async function recommendations(tmdbId: number) {
  const r = await tmdb<{ results: { id: number }[] }>(`/movie/${tmdbId}/recommendations`, { page: "1" });
  return r.results.map((x) => x.id);
}

// Für "Katalog auffüllen": Filme eines Jahres – nach Bekanntheit (Anzahl Stimmen) oder Bewertung
export async function discoverYear(year: number, sort: "votes" | "rating", page: number, noKids = false, minVotes = 600, minRating = 6.0) {
  const d = await tmdb<DiscoverResult>("/discover/movie", {
    ...(noKids ? { without_genres: "10751" } : {}), // 10751 = Familie
    sort_by: sort === "votes" ? "vote_count.desc" : "vote_average.desc",
    primary_release_year: String(year),
    "vote_count.gte": String(sort === "votes" ? minVotes : Math.max(minVotes, 1000)),
    "vote_average.gte": String(minRating),
    "with_runtime.gte": "60",
    include_adult: "false",
    page: String(page),
  });
  return { ids: d.results.map((r) => r.id), totalPages: d.total_pages };
}
