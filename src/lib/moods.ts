// Stimmungen für "Worauf hast du heute Lust?"
// Vorläufig über Genres abgebildet (TMDB, deutsche Genre-Namen).
// Mit Stufe 2 kommen echte Merkmale dazu (Grundstimmung, Spannung, Humoranteil …).

import type { Title } from "./types";

export type Mood = {
  key: string;
  label: string;
  hint: string;
  tint: string; // Farbe der Kachel
  any: string[]; // mindestens eins dieser Genres
  none?: string[]; // keines dieser Genres
  test?: (t: Title) => boolean; // zusätzliche Bedingung (Stichworte, Laufzeit, FSK …)
  group?: string; // Überschrift im Auswahlmenü
};

const kw = (t: Title, words: string[]) => (t.keywords ?? []).some((k) => words.includes(k.toLowerCase()));
const fsk = (t: Title) => Number(t.certification_de ?? 0);

export const MOODS: Mood[] = [
  { key: "spannend", label: "Spannend", hint: "Thriller, Krimi, Mystery", tint: "#0a84ff",
    any: ["Thriller", "Krimi", "Mystery"], none: ["Komödie", "Familie", "Animation"] },
  { key: "ernst", label: "Ernst & tiefgründig", hint: "Drama, Historie, Krieg", tint: "#5e5ce6",
    any: ["Drama", "Historie", "Kriegsfilm"], none: ["Komödie", "Familie", "Animation", "Action"] },
  { key: "lachen", label: "Zum Lachen", hint: "Komödien", tint: "#ffd60a",
    any: ["Komödie"], none: ["Horror", "Kriegsfilm"] },
  { key: "action", label: "Action & Adrenalin", hint: "Action, Abenteuer", tint: "#ff453a",
    any: ["Action", "Abenteuer"], none: ["Familie", "Animation"] },
  { key: "gaensehaut", label: "Gänsehaut", hint: "Horror & Grusel", tint: "#8e8e93",
    any: ["Horror"] },
  { key: "fantasie", label: "Andere Welten", hint: "Science-Fiction, Fantasy", tint: "#64d2ff",
    any: ["Science Fiction", "Fantasy"], none: ["Familie"] },
  { key: "herz", label: "Fürs Herz", hint: "Liebe, Gefühl, Musik", tint: "#ff375f",
    any: ["Liebesfilm", "Musik"], none: ["Horror", "Kriegsfilm"] },
  { key: "familie", label: "Leicht & für alle", hint: "Animation, Familie", tint: "#30d158",
    any: ["Animation", "Familie"], none: ["Horror"] },
  { key: "wahr", label: "Nach wahren Begebenheiten", hint: "Historie, Doku, Biografie", tint: "#bf8b5e",
    any: ["Historie", "Dokumentarfilm", "Drama"], test: (t) => (t.based_on ?? []).some((b) => b.startsWith("wahre")) || kw(t, ["based on true story", "biography", "based on a true story"]) || (t.genres ?? []).includes("Historie") },
  // Feinere Stimmungen
  { key: "kopf", label: "Kopfkino", hint: "Wendungen, Rätsel, Zeitspiele", tint: "#bf5af2", group: "Feiner",
    any: ["Mystery", "Thriller", "Science Fiction", "Drama", "Krimi"],
    test: (t) => kw(t, ["twist ending", "plot twist", "nonlinear timeline", "time loop", "time travel", "unreliable narrator", "mindfuck", "dream", "puzzle", "psychological thriller", "surprise ending"]) },
  { key: "duester", label: "Düster & hart", hint: "Thriller, Krimi, Horror ab FSK 16", tint: "#3a3a3c", group: "Feiner",
    any: ["Thriller", "Krimi", "Horror", "Kriegsfilm", "Drama"], none: ["Komödie", "Familie", "Animation"], test: (t) => fsk(t) >= 16 },
  { key: "gutelaune", label: "Gute Laune", hint: "Komödie, Musik, Abenteuer – leicht", tint: "#ff9f0a", group: "Feiner",
    any: ["Komödie", "Musik", "Familie", "Animation"], none: ["Horror", "Kriegsfilm", "Thriller"], test: (t) => fsk(t) <= 12 },
  { key: "episch", label: "Episch & groß", hint: "Abenteuer, Fantasy, Historie über 140 Min.", tint: "#ac8e68", group: "Feiner",
    any: ["Abenteuer", "Fantasy", "Historie", "Kriegsfilm", "Science Fiction"], test: (t) => (t.runtime_seconds ?? 0) >= 140 * 60 },
  { key: "heist", label: "Coups & Gauner", hint: "Heist, Betrug, Gangster", tint: "#30b0c7", group: "Feiner",
    any: ["Krimi", "Thriller", "Komödie", "Action"],
    test: (t) => kw(t, ["heist", "con artist", "gangster", "bank robbery", "robbery", "organized crime", "mafia", "swindle"]) || (t.wd_genres ?? []).some((g) => /heist|gangster/i.test(g)) },
  { key: "romanze", label: "Romantisch", hint: "Liebesfilme ohne Kitsch-Zwang", tint: "#ff6482", group: "Feiner",
    any: ["Liebesfilm"], none: ["Horror"] },
];

export const TIMES = {
  egal: { label: "Jede Länge", max: Infinity, min: 0 },
  bis95: { label: "Bis 95 Min.", max: 95 * 60 + 1, min: 0 },
  kurz: { label: "Bis 110 Min.", max: 110 * 60 + 1, min: 0 },
  mittel: { label: "110–140 Min.", max: 140 * 60 + 1, min: 110 * 60 + 1 },
  lang: { label: "Über 140 Min.", max: Infinity, min: 140 * 60 + 1 },
} as const;
export type TimeKey = keyof typeof TIMES;

export function matchesMood(t: Title, m: Mood) {
  const g = t.genres ?? [];
  if (!g.some((x) => m.any.includes(x))) return false;
  if (m.none && g.some((x) => m.none!.includes(x))) return false;
  if (m.test && !m.test(t)) return false;
  return true;
}

export function matchesTime(t: Title, key: TimeKey) {
  if (key === "egal") return true;
  if (!t.runtime_seconds) return false; // unbekannt = nicht sicher passend
  const { min, max } = TIMES[key];
  return t.runtime_seconds >= min && t.runtime_seconds < max;
}

// Zeitraum (Vorschläge gibt es ohnehin erst ab 1990)
export const PERIODS: Record<string, { label: string; from: number; to: number }> = {
  alle: { label: "Seit 1990", from: 1990, to: 9999 },
  "90er": { label: "90er", from: 1990, to: 1999 },
  "2000er": { label: "2000er", from: 2000, to: 2009 },
  "2010er": { label: "2010er", from: 2010, to: 2019 },
  "2020er": { label: "Ab 2020", from: 2020, to: 9999 },
  neu: { label: "Letzte 5 Jahre", from: new Date().getFullYear() - 5, to: 9999 },
};

// Art der Auswahl
// "Entdecken" (Standard): Filme, die du wahrscheinlich noch nicht auf dem Schirm hast –
// keine weiteren Teile von Reihen/Universen, die du schon kennst, sehr bekannte Filme etwas weiter hinten.
// "Sichere Wahl": alles, was gut passt – auch Fortsetzungen.
export const MODES: Record<string, string> = {
  entdecken: "Entdecken",
  sicher: "Sichere Wahl",
  geheimtipp: "Geheimtipps",
  bekannt: "Bekannte Filme",
  preise: "Preisgekrönt",
};
