export type Title = {
  id: number;
  media_type: "movie" | "tv";
  tmdb_id: number;
  tmdb_recs?: number[] | null; // Ergänzung 17: TMDB-Empfehlungen (TMDB-IDs)
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
  vote_average?: number | null;
  vote_count?: number | null;
  directors: string[] | null;
  studios: string[] | null;
  collection_id: number | null;
  collection_name: string | null;
  imdb_id?: string | null;
  oscars?: string[] | null;
  festivals?: string[] | null;
  keywords?: string[] | null;
  writers?: string[] | null;
  cinematographers?: string[] | null;
  composers?: string[] | null;
  certification_de?: string | null;
  based_on?: string[] | null;
  wd_genres?: string[] | null;
  narrative_locations?: string[] | null;
  set_in_period?: string[] | null;
  main_subjects?: string[] | null;
  black_and_white?: boolean | null;
  budget_usd?: number | null;
  box_office_usd?: number | null;
  nominations?: string[] | null;
  filming_locations?: string[] | null;
  ai?: import("./aiFeatures").AiFeatures | null; // KI-Merkmale (Stufe 2), nicht in der Tabelle titles
  canon?: string[] | null;
  cast_names?: string[] | null;
  globes?: string[] | null;
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
  return `${Math.round(seconds / 60)} Min.`;
}

export function formatScore(rating: number | null) {
  if (!rating) return null;
  return `${rating}/10`;
}

// Preiskategorien ins Deutsche übersetzen (unbekannte bleiben englisch).
const AWARD_DE: [RegExp, string][] = [
  [/^Best Picture$|^Best Motion Picture – Drama$/, "Bester Film"],
  [/^Best Motion Picture – Musical or Comedy$|^Best Motion Picture – Comedy or Musical$/, "Bester Film (Komödie/Musical)"],
  [/^Best Director$/, "Beste Regie"],
  [/^Best Actor$|^Best Actor – Motion Picture Drama$/, "Bester Hauptdarsteller"],
  [/^Best Actress$|^Best Actress – Motion Picture Drama$/, "Beste Hauptdarstellerin"],
  [/^Best Actor – Motion Picture (Musical or Comedy|Comedy or Musical)$/, "Bester Hauptdarsteller (Komödie/Musical)"],
  [/^Best Actress – Motion Picture (Musical or Comedy|Comedy or Musical)$/, "Beste Hauptdarstellerin (Komödie/Musical)"],
  [/^Best Supporting Actor/, "Bester Nebendarsteller"],
  [/^Best Supporting Actress/, "Beste Nebendarstellerin"],
  [/Original Screenplay/, "Bestes Originaldrehbuch"],
  [/Adapted Screenplay/, "Bestes adaptiertes Drehbuch"],
  [/^Best Screenplay$/, "Bestes Drehbuch"],
  [/^Best Cinematography$/, "Beste Kamera"],
  [/^Best Film Editing$/, "Bester Schnitt"],
  [/^Best Original (Dramatic )?Score$|^Best Original Musical/, "Beste Filmmusik"],
  [/^Best Original Song$/, "Bester Song"],
  [/^Best Visual Effects$/, "Beste visuelle Effekte"],
  [/^Best Sound Editing$/, "Bester Tonschnitt"],
  [/^Best Sound( Mixing)?$/, "Bester Ton"],
  [/^Best Costume Design$/, "Bestes Kostümdesign"],
  [/^Best (Production Design|Art Direction)$/, "Bestes Szenenbild"],
  [/Makeup/, "Bestes Make-up"],
  [/^Best Animated Feature/, "Bester Animationsfilm"],
  [/^Best International Feature Film$|^Best Foreign Language Film$/, "Bester internationaler Film"],
  [/^Best (Non-English Language|Foreign Language) (Motion Picture|Film)/, "Bester fremdsprachiger Film"],
  [/^Best Documentary Feature/, "Bester Dokumentarfilm"],
  [/Animated Short/, "Bester animierter Kurzfilm"],
  [/Live Action Short/, "Bester Kurzfilm"],
  [/Documentary.*Short/, "Bester Dokumentar-Kurzfilm"],
  [/Casting/, "Bestes Casting"],
];
export function awardDe(name: string) {
  return AWARD_DE.find(([re]) => re.test(name))?.[1] ?? name;
}

// TMDB-Bewertung lesbar machen, z. B. "7,8 · 24.300 Stimmen"
export function formatVotes(avg: number | null | undefined, count: number | null | undefined) {
  if (avg == null || count == null) return null;
  return `${avg.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · ${count.toLocaleString("de-DE")} Stimmen`;
}

// Geldbetrag kurz: 160000000 → "160 Mio. $", 2847379794 → "2,8 Mrd. $"
export function formatUsd(v: number | null | undefined) {
  if (!v) return null;
  if (v >= 1e9) return `${(v / 1e9).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mrd. $`;
  if (v >= 1e6) return `${Math.round(v / 1e6).toLocaleString("de-DE")} Mio. $`;
  return `${Math.round(v / 1e3).toLocaleString("de-DE")} Tsd. $`;
}
