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
};

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
    any: ["Historie", "Dokumentarfilm"] },
];

export const TIMES = {
  egal: { label: "Egal wie lang", max: Infinity, min: 0 },
  kurz: { label: "Unter 1 ¾ Std.", max: 105 * 60, min: 0 },
  mittel: { label: "1 ¾ – 2 ½ Std.", max: 150 * 60, min: 105 * 60 },
  lang: { label: "Darf lang sein (2 ½ Std.+)", max: Infinity, min: 150 * 60 },
} as const;
export type TimeKey = keyof typeof TIMES;

export function matchesMood(t: Title, m: Mood) {
  const g = t.genres ?? [];
  if (!g.some((x) => m.any.includes(x))) return false;
  if (m.none && g.some((x) => m.none!.includes(x))) return false;
  return true;
}

export function matchesTime(t: Title, key: TimeKey) {
  if (key === "egal") return true;
  if (!t.runtime_seconds) return false; // unbekannt = nicht sicher passend
  const { min, max } = TIMES[key];
  return t.runtime_seconds >= min && t.runtime_seconds < max;
}
