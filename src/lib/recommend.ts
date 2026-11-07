// "Für dich" – Version 1 der Empfehlungen.
//
// Idee (einfach erklärt):
// 1. Wir schauen, wie du Filme im Vergleich zu deinem eigenen Durchschnitt bewertest.
//    Gibst du Nolan-Filmen 1 Stern mehr als sonst, ist "Regie: Nolan" ein Plus.
// 2. Wenige Belege zählen wenig (1 Film ist Zufall, 5 Filme sind ein Muster).
// 3. Jeder noch nicht gesehene Film bekommt Punkte für seine Merkmale.
// 4. Die stärksten Gründe werden als Erklärung angezeigt – nur aus echten Daten.
//
// Stufe 2 ergänzt später die tiefen Merkmale (Stimmung, Komplexität, Humor …).

import type { Title } from "./types";
import { aspectStrength } from "./aspects";
import { AI_SCALES, type AiScale } from "./aiFeatures";

// reason: Grund bei "Kein Interesse"; aspects: was gefallen/gestört hat ("+regie:Nolan", "-aspekt:langatmig")
// 7) Antworten aus dem Modell-Duell als zusätzliche Einträge (nur fürs Profil, nicht als "gesehen")
export const DUEL_YES = "duell_passt";
export const DUEL_NO = "duell_nicht";
export function duelEntries(answers: Map<number, boolean>, byId: Map<number, Title>): RatedTitle[] {
  return [...answers].flatMap(([id, yes]) => {
    const t = byId.get(id);
    return t ? [{ ...t, rating: null, status: yes ? DUEL_YES : DUEL_NO }] : [];
  });
}

export type RatedTitle = Title & { rating: number | null; status: string; reason?: string | null; aspects?: string[]; favorite?: boolean };

export type FeatureKind =
  | "genre" | "regie" | "besetzung" | "reihe" | "jahrzehnt" | "preise"
  | "subgenre" | "thema" | "drehbuch" | "kamera" | "musik" | "vorlage" | "stil" | "budget"
  | "land" | "sprache" | "studio" | "genrepaar" // nur aktiv, wenn per Schalter eingeschaltet (Gewicht sonst 0)
  | AiKind;

// KI-Merkmale (Stufe 2): jede Skala ist eine eigene Merkmalsart, damit der Messtest sie einzeln prüfen kann
export type AiKind = `ki_${AiScale}` | "ki_stimmung" | "ki_humorart" | "ki_struktur";
const AI_SCALE_KEYS = Object.keys(AI_SCALES) as AiScale[];
export const AI_KINDS: AiKind[] = [...AI_SCALE_KEYS.map((k) => `ki_${k}` as AiKind), "ki_stimmung", "ki_humorart", "ki_struktur"];
const aiRecord = <T,>(f: (k: AiKind) => T) => Object.fromEntries(AI_KINDS.map((k) => [k, f(k)])) as Record<AiKind, T>;

// Wie stark eine Merkmalsart zählt (vorläufig, wie in der Spezifikation vorgesehen)
const KIND_WEIGHT: Record<FeatureKind, number> = {
  regie: 1.0,
  reihe: 1.0,
  genre: 0.8,
  besetzung: 0.6,
  preise: 0.5,
  jahrzehnt: 0.4,
  subgenre: 0.6, // feine Genres (Wikidata), z. B. Neo-Noir
  thema: 0.5, // Stichworte (TMDB) + Hauptthemen (Wikidata)
  drehbuch: 0.6,
  kamera: 0.3,
  musik: 0.3,
  vorlage: 0.3, // basiert auf Buch / Comic / wahrer Person …
  stil: 0.4, // Schwarzweiß
  budget: 0.4, // Großproduktion vs. kleiner Film
  land: 0, sprache: 0, studio: 0, genrepaar: 0, // Schalter: originWeight / genrePairWeight
  ...aiRecord(() => 0.5),
};

// Zu allgemeine Begriffe zählen nicht (sagen nichts über den Geschmack)
const GENERIC_SUBGENRES = new Set([
  "Filmdrama", "Actionfilm", "Abenteuerfilm", "Filmkomödie", "Kriminalfilm", "Thriller", "Horrorfilm",
  "Science-Fiction-Film", "Fantasyfilm", "spannender Film", "Monumentalfilm", "Liebesfilm", "Animationsfilm",
]);
const NOISE_KEYWORDS = new Set([
  "duringcreditsstinger", "aftercreditsstinger", "woman director", "sequel", "remake", "based on novel or book",
  "based on comic", "3d", "imax", "live action remake", "shot on imax", "independent film", "male protagonist",
]);
// Verständliche Namen der Merkmalsarten (für den Messtest)
export const KIND_NAMES: Record<FeatureKind, string> = {
  genre: "Genres", regie: "Regie", besetzung: "Besetzung", reihe: "Filmreihen", jahrzehnt: "Jahrzehnt",
  preise: "Preise & Nominierungen", subgenre: "Feine Genres", thema: "Themen & Stichworte", drehbuch: "Drehbuch",
  kamera: "Kamera", musik: "Filmmusik", vorlage: "Vorlage (Buch, Comic …)", stil: "Schwarzweiß", budget: "Budget",
  land: "Herkunftsland", sprache: "Originalsprache", studio: "Studio", genrepaar: "Genre-Kombination",
  ...aiRecord((k) =>
    k === "ki_stimmung" ? "KI: Grundstimmung" : k === "ki_humorart" ? "KI: Humorart" : k === "ki_struktur" ? "KI: Erzählweise"
      : `KI: ${AI_SCALES[k.slice(3) as AiScale].name}`),
};

// Allgemeine Qualität: TMDB-Bewertung, vorsichtig gerechnet.
// Wenige Stimmen werden zum Mittelwert (6,6) hingezogen – 8,5 bei 40 Stimmen zählt kaum.
const QUALITY_PRIOR = 6.6;
const QUALITY_VOTES = 800;
export function qualityOf(t: Title): number | null {
  if (t.vote_average == null || !t.vote_count) return null;
  const q = (t.vote_average * t.vote_count + QUALITY_PRIOR * QUALITY_VOTES) / (t.vote_count + QUALITY_VOTES);
  return q - QUALITY_PRIOR; // ca. −2 bis +2
}

// Vorschläge erst ab diesem Erscheinungsjahr (Katalog bleibt unverändert)
export const SUGGEST_FROM_YEAR = 1980;

export type ScoreOptions = {
  interestWeight?: number; // wie stark zählt, welche ART von Filmen du schaust (0 = aus)
  // --- Schalter für Verbesserungen (werden im nachträglichen Test verglichen) ---
  interestByRating?: boolean; // 1) Interesse nach Bewertung gewichten (9–10 stark, bis 5 dagegen)
  similarityWeight?: number; // 2) Ähnlichkeit zu Lieblingsfilmen / 9–10ern (und Abstand zu Flops)
  rareKeywords?: boolean; // 3) seltene Stichworte/feine Genres zählen mehr als häufige
  originWeight?: number; // 4) Herkunftsland, Originalsprache, Studio als Merkmal
  genreQuality?: boolean; // 5) Qualität im Vergleich zum Genre (Horror mit 7,0 ist stark)
  genrePairWeight?: number; // 6) Genre-Kombinationen (Sci-Fi + Drama ≠ Sci-Fi + Action)
  duelWeight?: number; // 7) Duell-Antworten zu unbekannten Filmen (passt / passt nicht) als Lernstoff
  qualityWeight?: number; // 1 = so stark, wie es zu deinen Bewertungen passt; 0 = ignorieren
  tasteWeight?: number; // wie stark dein persönlicher Geschmack zählt (wird per Messtest gewählt)
  shrink?: number; // Vorsicht bei wenigen Belegen (mehr = vorsichtiger)
  skipKinds?: FeatureKind[]; // Merkmalsarten weglassen (nur für den Messtest)
};
export const DEFAULT_OPTIONS: { qualityWeight: number; tasteWeight: number; shrink: number } = { qualityWeight: 1, tasteWeight: 1, shrink: 2 };
export const DEFAULT_INTEREST = 1;

// Einstellung für Vorschläge unbekannter Filme (Filmfinder) – festgelegt per Modell-Duell
// (325 Antworten, Nov. 2026): Interesse ×1 mit halber allgemeiner Qualität lag vorn (72 %),
// "Bisher" (v. a. Qualität) bei 47 %, KI-Merkmale (Haiku) brachten nichts dazu.
// Nov. 2026 (431 Antworten): "Alle Verbesserungen 1–6" 76 % (Rücktest) und 35 % live – beides vorn → übernommen.
export const APP_SETTINGS: ScoreOptions = {
  interestWeight: 1, qualityWeight: 0.5,
  interestByRating: true, similarityWeight: 2, rareKeywords: true, originWeight: 0.4, genreQuality: true, genrePairWeight: 0.6,
};

type Feature = { key: string; kind: FeatureKind; label: string };

export function featuresOf(t: Title): Feature[] {
  const f: Feature[] = [];
  for (const g of t.genres ?? []) f.push({ key: `genre:${g}`, kind: "genre", label: g });
  for (const d of t.directors ?? []) f.push({ key: `regie:${d}`, kind: "regie", label: d });
  for (const a of (t.cast_names ?? []).slice(0, 5)) f.push({ key: `besetzung:${a}`, kind: "besetzung", label: a });
  if (t.collection_id && t.collection_name)
    f.push({ key: `reihe:${t.collection_id}`, kind: "reihe", label: t.collection_name });
  if (t.release_year) {
    const dec = Math.floor(t.release_year / 10) * 10;
    f.push({ key: `jahrzehnt:${dec}`, kind: "jahrzehnt", label: `${String(dec).slice(2)}er-Jahre` });
  }
  if ((t.oscars?.length ?? 0) + (t.globes?.length ?? 0) > 0)
    f.push({ key: "preise:ja", kind: "preise", label: "Preisgekrönte Filme" });
  for (const g of t.wd_genres ?? []) if (!GENERIC_SUBGENRES.has(g)) f.push({ key: `subgenre:${g}`, kind: "subgenre", label: g });
  for (const k of (t.keywords ?? []).slice(0, 15)) if (!NOISE_KEYWORDS.has(k)) f.push({ key: `thema:${k}`, kind: "thema", label: k });
  for (const m of t.main_subjects ?? []) f.push({ key: `thema:${m}`, kind: "thema", label: m.replace(/^Person: /, "") });
  for (const p of t.set_in_period ?? []) f.push({ key: `thema:zeit:${p}`, kind: "thema", label: `spielt ${p}` });
  for (const l of t.narrative_locations ?? []) f.push({ key: `thema:ort:${l}`, kind: "thema", label: `Schauplatz ${l}` });
  for (const w of (t.writers ?? []).slice(0, 3)) f.push({ key: `drehbuch:${w}`, kind: "drehbuch", label: w });
  for (const c of t.cinematographers ?? []) f.push({ key: `kamera:${c}`, kind: "kamera", label: c });
  for (const c of t.composers ?? []) f.push({ key: `musik:${c}`, kind: "musik", label: c });
  for (const b of t.based_on ?? []) {
    const kind = b.includes(":") ? b.split(":")[0] : null; // "Buch", "Comic", "wahre Person" …
    if (kind) f.push({ key: `vorlage:${kind}`, kind: "vorlage", label: `nach ${kind === "wahre Person" ? "wahrer Geschichte" : kind}` });
  }
  for (const c of (t.countries ?? []).slice(0, 2)) f.push({ key: `land:${c}`, kind: "land", label: c });
  if (t.original_language) f.push({ key: `sprache:${t.original_language}`, kind: "sprache", label: t.original_language.toUpperCase() });
  for (const st of (t.studios ?? []).slice(0, 2)) f.push({ key: `studio:${st}`, kind: "studio", label: st });
  const gs = (t.genres ?? []).slice(0, 3).slice().sort();
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++)
    f.push({ key: `genrepaar:${gs[i]}+${gs[j]}`, kind: "genrepaar", label: `${gs[i]} + ${gs[j]}` });
  if (t.black_and_white) f.push({ key: "stil:sw", kind: "stil", label: "Schwarzweiß-Filme" });
  if (t.certification_de === "16" || t.certification_de === "18") f.push({ key: `stil:fsk${t.certification_de}`, kind: "stil", label: `FSK ${t.certification_de}` });
  if ((t.nominations?.length ?? 0) >= 5) f.push({ key: "preise:nominiert", kind: "preise", label: "Viel nominierte Filme" });
  if (t.budget_usd) {
    const b = t.budget_usd;
    const [key, label] = b >= 100e6 ? ["gross", "Großproduktionen"] : b < 20e6 ? ["klein", "Kleinere Produktionen"] : ["mittel", "Mittleres Budget"];
    f.push({ key: `budget:${key}`, kind: "budget", label });
  }
  // KI-Merkmale: Skala 0–4 in drei Stufen (wenig / mittel / viel)
  if (t.ai && t.ai.sicherheit >= 0.3) {
    for (const k of AI_SCALE_KEYS) {
      const v = t.ai[k];
      if (v == null) continue;
      const lvl = v <= 1 ? "low" : v === 2 ? "mid" : "high";
      f.push({ key: `ki_${k}:${lvl}`, kind: `ki_${k}`, label: AI_SCALES[k][lvl] });
    }
    for (const s of t.ai.stimmung ?? []) f.push({ key: `ki_stimmung:${s}`, kind: "ki_stimmung", label: `Stimmung: ${s}` });
    for (const h of t.ai.humorarten ?? []) f.push({ key: `ki_humorart:${h}`, kind: "ki_humorart", label: `Humor: ${h}` });
    for (const s of t.ai.struktur ?? []) if (s !== "chronologisch")
      f.push({ key: `ki_struktur:${s}`, kind: "ki_struktur", label: `Erzählweise: ${s.replace("_", " ")}` });
  }
  return f;
}

export type Preference = {
  key: string;
  kind: FeatureKind;
  label: string;
  pref: number; // in Punkten über/unter deinem Schnitt (vorsichtig geschätzt)
  n: number; // Anzahl bewerteter Filme mit diesem Merkmal
  avgScore: number | null; // dein Durchschnitt (1–10) bei diesen Filmen
};

export type Recommendation = {
  title: Title;
  score: number;
  reasons: string[];
  coverage: number; // wie viele Merkmale des Films wir schon einschätzen können (0–1)
};

// Wie stark folgen deine Punkte der allgemeinen Meinung? (einfache Gerade: Punkte ≈ Schnitt + Steigung × Qualität)
function fitQuality(withRating: RatedTitle[], mean: number) {
  const qs = withRating.map((r) => ({ q: qualityOf(r), r: r.rating! })).filter((x) => x.q != null) as { q: number; r: number }[];
  const qMean = qs.reduce((s, x) => s + x.q, 0) / Math.max(1, qs.length);
  let sxy = 0, sxx = 0;
  for (const x of qs) { sxy += (x.q - qMean) * (x.r - mean); sxx += (x.q - qMean) ** 2; }
  const slope = Math.max(0, Math.min(3, sxx > 0 ? sxy / (sxx + 3) : 0)); // +3 = Vorsicht bei wenigen Filmen
  return { qMean, slope };
}

export type Profile = ReturnType<typeof buildProfile>;

// ---------------- Interesse: Welche ART von Filmen schaust du? ----------------
// Vergleicht deine Filme (gesehen + Merkliste) mit dem ganzen Katalog.
// Beispiel: 28 % deiner Filme sind Science-Fiction, im Katalog nur 9 % → klares Plus.
// Ein Musical-Klassiker mit TMDB 8,2 rutscht dagegen nach unten, wenn du nie Musicals schaust.
export type Interest = { key: string; kind: FeatureKind; label: string; lift: number; mine: number; expected: number; share: number; catShare: number };
const PSEUDO = 3; // Vorsicht bei kleinen Zahlen

// "Kein Interesse" mit Grund: wirkt gezielt auf die passenden Merkmale
const HARD_GENRES = new Set(["Horror", "Thriller", "Kriegsfilm", "Krimi"]);
function reasonWeight(reason: string | null | undefined, f: Feature) {
  switch (reason) {
    case "genre": return f.kind === "genre" || f.kind === "subgenre" ? -2 : 0;
    case "hart": return (f.kind === "genre" && HARD_GENRES.has(f.label)) || f.key.startsWith("stil:fsk") ? -1.5 : -0.3;
    case "leute": return f.kind === "regie" || f.kind === "besetzung" ? -2 : -0.2;
    case "langweilig": return -0.9;
    default: return -0.7;
  }
}

// Wie stark ein gesehener Film fürs Interesse zählt (Schalter interestByRating) – Lieblingsfilme immer stark
function interestWeightOf(r: RatedTitle, byRating: boolean, duelWeight = 0) {
  // 7) Duell: "passt" = will ich sehen (ähnlich Merkliste, etwas stärker), "passt nicht" = eher kein Interesse
  if (r.status === DUEL_YES) return 0.8 * duelWeight;
  if (r.status === DUEL_NO) return -0.5 * duelWeight;
  let w = r.status === "gesehen" ? 1 : r.status === "merkliste" ? 0.5 : r.status === "nicht_interessiert" ? -0.7 : 0;
  if (byRating && r.status === "gesehen" && r.rating) {
    const x = r.rating;
    w = x >= 9 ? 1.6 : x >= 8 ? 1.3 : x >= 7 ? 1 : x >= 6 ? 0.6 : x >= 5 ? 0.25 : -0.4;
  }
  if (r.favorite) w = Math.max(w, 2);
  return w;
}

export function buildInterest(rated: RatedTitle[], catalog: Title[], opts: ScoreOptions = {}) {
  const catCount = new Map<string, number>();
  for (const t of catalog) for (const f of new Set(featuresOf(t).map((x) => x.key))) catCount.set(f, (catCount.get(f) ?? 0) + 1);
  // KI-Merkmale gibt es nur für einen Teil der Filme → dort nur mit eingeschätzten Filmen vergleichen
  const catAi = Math.max(1, catalog.filter((t) => t.ai).length);
  const mine = new Map<string, { f: Feature; n: number }>();
  let total = 0, totalAi = 0;
  for (const r of rated) {
    const w = interestWeightOf(r, !!opts.interestByRating, opts.duelWeight ?? 0);
    if (!w) continue;
    if (w > 0) { total += w; if (r.ai) totalAi += w; }
    const seen = new Set<string>();
    for (const f of featuresOf(r)) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      const a = mine.get(f.key) ?? { f, n: 0 };
      a.n += w < 0 ? (r.status === "nicht_interessiert" ? reasonWeight(r.reason, f) : w) : w;
      mine.set(f.key, a);
    }
  }
  const N = Math.max(1, catalog.length);
  const out = new Map<string, Interest>();
  const allKeys = new Set([...catCount.keys(), ...mine.keys()]);
  for (const key of allKeys) {
    const c = catCount.get(key) ?? 0;
    const m = mine.get(key);
    const isAi = key.startsWith("ki_");
    const expected = isAi ? totalAi * (c / catAi) : total * (c / N); // so oft wäre das Merkmal bei dir "zufällig" zu erwarten
    const n = Math.max(0, m?.n ?? 0);
    const lift = Math.log((n + PSEUDO) / (expected + PSEUDO));
    const f = m?.f ?? null;
    out.set(key, {
      key, kind: (f?.kind ?? key.split(":")[0]) as FeatureKind, label: f?.label ?? key.split(":").slice(1).join(":"),
      lift, mine: n, expected, share: (isAi ? totalAi : total) ? n / (isAi ? totalAi : total) : 0, catShare: c / (isAi ? catAi : N),
    });
  }
  return out;
}

export function buildProfile(rated: RatedTitle[], opts: ScoreOptions = {}, catalog?: Title[]) {
  const shrink = opts.shrink ?? DEFAULT_OPTIONS.shrink;
  const withRating = rated.filter((r) => r.status === "gesehen" && r.rating);
  const mean = withRating.reduce((s, r) => s + r.rating!, 0) / Math.max(1, withRating.length);
  const { qMean, slope } = fitQuality(withRating, mean);
  // Was die allgemeine Qualität allein für dich erwarten lässt
  const expected = (t: Title) => { const q = qualityOf(t); return mean + (q == null ? 0 : slope * (q - qMean)); };

  // Beobachtungen sammeln
  const acc = new Map<string, { f: Feature; sumW: number; sumWD: number; n: number; sumR: number }>();
  const add = (t: Title, dev: number, w: number, rating: number | null) => {
    for (const f of featuresOf(t)) {
      const a = acc.get(f.key) ?? { f, sumW: 0, sumWD: 0, n: 0, sumR: 0 };
      a.sumW += w;
      a.sumWD += w * dev;
      if (rating) { a.n += 1; a.sumR += rating; }
      acc.set(f.key, a);
    }
  };
  // Kurze Fragen: "Regie: Nolan hat gefallen" usw. = starke, eindeutige Beobachtung
  // Gewicht je nach Bewertung: "Regie top" bei einer 10 zählt mehr als bei einer 7 (siehe aspectStrength)
  const aspectCounts = new Map<string, { pos: number; neg: number }>();
  for (const r of rated) {
    for (const a of r.aspects ?? []) {
      const sign = a.startsWith("-") ? -1 : 1;
      const key = a.slice(1);
      const w = aspectStrength(sign as 1 | -1, r.rating);
      if (key.startsWith("aspekt:")) {
        const c = aspectCounts.get(key) ?? { pos: 0, neg: 0 };
        if (sign > 0) c.pos += w; else c.neg += w;
        aspectCounts.set(key, c);
        continue;
      }
      const f = featuresOf(r).find((x) => x.key === key);
      if (f) {
        const acc0 = acc.get(f.key) ?? { f, sumW: 0, sumWD: 0, n: 0, sumR: 0 };
        acc0.sumW += 1.5 * w;
        acc0.sumWD += 1.5 * w * sign * 2.5;
        acc.set(f.key, acc0);
      }
    }
  }
  for (const r of rated) {
    // Gelernt wird nur, was von der Erwartung abweicht: Mag jemand Nolan nur, weil Nolan-Filme
    // allgemein gut sind, ist das schon über die Qualität abgedeckt und zählt hier nicht doppelt.
    if (r.status === "gesehen" && r.rating) add(r, r.rating - expected(r), 1, r.rating);
    else if (r.status === "nicht_interessiert") add(r, -2, 0.5, null); // schwaches Minus
    else if (r.status === "merkliste") add(r, 1, 0.3, null); // sehr schwaches Plus
    else if (r.status === DUEL_YES && opts.duelWeight) add(r, 1.5, 0.4 * opts.duelWeight, null);
    else if (r.status === DUEL_NO && opts.duelWeight) add(r, -1.5, 0.4 * opts.duelWeight, null);
    if (r.favorite) add(r, 2, 0.8, null); // Lieblingsfilm: zusätzliches, deutliches Plus
  }

  const prefs = new Map<string, Preference>();
  for (const [key, a] of acc) {
    prefs.set(key, {
      key,
      kind: a.f.kind,
      label: a.f.label,
      pref: a.sumWD / (a.sumW + shrink) / 2, // halbiert, damit die Gewichte im gleichen Rahmen bleiben
      n: a.n,
      avgScore: a.n ? a.sumR / a.n : null,
    });
  }
  const interest = catalog?.length ? buildInterest(rated, catalog, opts) : null;

  // 2) Ähnlichkeit: Anker = Lieblingsfilme + 9–10er (zu wenige? dann auch 8er); Gegen-Anker = Filme bis 4
  let anchorsPos: { t: Title; v: Map<string, number>; fav: boolean }[] = [];
  let anchorsNeg: Map<string, number>[] = [];
  if (opts.similarityWeight) {
    let pos = rated.filter((r) => r.favorite || (r.status === "gesehen" && (r.rating ?? 0) >= 9));
    if (pos.length < 8) pos = rated.filter((r) => r.favorite || (r.status === "gesehen" && (r.rating ?? 0) >= 8));
    anchorsPos = pos.slice(0, 120).map((t) => ({ t, v: simVector(t), fav: !!t.favorite }));
    anchorsNeg = rated.filter((r) => r.status === "gesehen" && r.rating != null && r.rating <= 4).slice(0, 80).map((r) => simVector(r));
  }

  // 5) Qualität je Genre: Durchschnitt pro Hauptgenre im Katalog (vorsichtig gemittelt)
  const genreQ = new Map<string, number>();
  if (opts.genreQuality && catalog?.length) {
    const sums = new Map<string, { s: number; n: number }>();
    let all = 0, n = 0;
    for (const t of catalog) {
      const q = qualityOf(t), g = t.genres?.[0];
      if (q == null || !g) continue;
      all += q; n++;
      const x = sums.get(g) ?? { s: 0, n: 0 };
      x.s += q; x.n++;
      sums.set(g, x);
    }
    const avg = n ? all / n : 0;
    for (const [g, x] of sums) genreQ.set(g, ((x.s / x.n) - avg) * (x.n / (x.n + 30)));
  }
  return { prefs, interest, aspectCounts, anchorsPos, anchorsNeg, genreQ, ratedCount: withRating.length, meanScore: mean, qMean, qualitySlope: slope };
}

const KIND_LABEL: Record<FeatureKind, string> = {
  subgenre: "Genre",
  thema: "Thema",
  drehbuch: "Drehbuch",
  kamera: "Kamera",
  musik: "Musik",
  vorlage: "Vorlage",
  stil: "",
  budget: "",
  land: "Aus",
  sprache: "Sprache",
  studio: "Studio",
  genrepaar: "Genre",
  ...aiRecord(() => ""),
  regie: "Regie",
  besetzung: "Mit",
  genre: "Genre",
  reihe: "Reihe",
  jahrzehnt: "Zeit",
  preise: "",
};

function reasonText(p: Preference) {
  const stars = p.avgScore ? `Ø ${p.avgScore.toLocaleString("de-DE", { maximumFractionDigits: 1 })}` : "";
  const evidence = p.n ? `${p.n} ${p.n === 1 ? "Film" : "Filme"} bewertet${stars ? `, ${stars}` : ""}` : "aus deiner Merkliste";
  const head = KIND_LABEL[p.kind] ? `${KIND_LABEL[p.kind]}: ${p.label}` : p.label;
  return `${head} (${evidence})`;
}

// Gewichte fürs Interesse: Es soll vor allem die ART des Films treffen (Genre, Thema, Zeit),
// nicht "noch ein Teil derselben Reihe / mit denselben Schauspielern" – sonst flutet z. B. das MCU alles.
const INTEREST_WEIGHT: Record<FeatureKind, number> = {
  genre: 1.0, subgenre: 0.7, thema: 0.5, jahrzehnt: 0.4, vorlage: 0.3, budget: 0.3, stil: 0.3, preise: 0.2,
  regie: 0.35, besetzung: 0.15, reihe: 0.4, drehbuch: 0.15, kamera: 0.1, musik: 0.1,
  land: 0, sprache: 0, studio: 0, genrepaar: 0,
  ...aiRecord(() => 0.4),
};

// Große Film-Universen, die bei TMDB aus vielen einzelnen Reihen bestehen – für die Vielfalt zählen sie als eine Gruppe
const UNIVERSES: [string, RegExp][] = [
  ["Marvel", /^Marvel Studios$/i],
  ["Star Wars", /^Lucasfilm/i],
  ["DC", /^(DC Films|DC Studios|DC Entertainment|DC Comics)$/i],
  ["Wizarding World", /^Heyday Films$/i],
];
export function franchiseOf(t: Title): string | null {
  for (const [name, re] of UNIVERSES) if ((t.studios ?? []).some((s) => re.test(s))) return name;
  return t.collection_id ? `reihe:${t.collection_id}` : null;
}

// "Zu langatmig" → sehr lange Filme etwas nach hinten, "Zu brutal" → FSK 18, "Humor gefällt" → Komödien …
export const ASPECT_LABELS: Record<string, [string, string]> = {
  "aspekt:story": ["die Geschichte", "schwache Geschichten"], "aspekt:spannung": ["Spannung", "–"], "aspekt:atmosphaere": ["Atmosphäre", "–"],
  "aspekt:gefuehl": ["Emotionen", "–"], "aspekt:wendungen": ["Wendungen", "–"], "aspekt:humor": ["Humor", "Humor, der nicht passt"],
  "aspekt:schauspiel": ["Schauspiel", "–"], "aspekt:langatmig": ["–", "zu langatmig"], "aspekt:vorhersehbar": ["–", "zu vorhersehbar"],
  "aspekt:brutal": ["–", "zu brutal"], "aspekt:kitsch": ["–", "zu kitschig"], "aspekt:laut": ["–", "zu viel Action / Krach"],
  "aspekt:figuren": ["starke Figuren", "blasse Figuren"], "aspekt:tiefgang": ["Tiefgang", "fehlender Tiefgang"],
  "aspekt:ende": ["ein gutes Ende", "schwaches Ende"], "aspekt:musik": ["Filmmusik", "unpassende Filmmusik"], "aspekt:dialoge": ["Dialoge", "–"], "aspekt:fortsetzung": ["–", "ausgereizte Reihen"],
};
function aspectAdjust(t: Title, counts: Map<string, { pos: number; neg: number }>) {
  if (!counts.size) return 0;
  const c = (k: string) => counts.get(k) ?? { pos: 0, neg: 0 };
  const g = new Set(t.genres ?? []);
  let x = 0;
  if ((t.runtime_seconds ?? 0) > 150 * 60) x -= 0.15 * c("aspekt:langatmig").neg;
  if (t.certification_de === "18") x -= 0.2 * c("aspekt:brutal").neg;
  if (g.has("Komödie")) x += 0.1 * (c("aspekt:humor").pos - c("aspekt:humor").neg);
  if (g.has("Thriller") || g.has("Mystery")) x += 0.1 * (c("aspekt:spannung").pos + c("aspekt:wendungen").pos);
  if (g.has("Liebesfilm")) x -= 0.15 * c("aspekt:kitsch").neg;
  if (g.has("Action")) x -= 0.1 * c("aspekt:laut").neg;
  if (t.collection_id) x -= 0.1 * c("aspekt:fortsetzung").neg;
  if (g.has("Drama")) x += 0.05 * (c("aspekt:tiefgang").pos + c("aspekt:tiefgang").neg); // Tiefgang gefiel / fehlte → mehr Tiefgang
  if (g.has("Thriller") || g.has("Krimi")) x -= 0.08 * c("aspekt:vorhersehbar").neg * ((t.vote_average ?? 7) < 6.8 ? 1 : 0);
  return Math.max(-0.6, Math.min(0.6, x));
}

const INTEREST_REASON_KINDS = new Set<FeatureKind>(["genre", "subgenre", "regie", "reihe", "thema", "besetzung", "vorlage", ...AI_KINDS]);

function interestText(it: Interest) {
  const head = KIND_LABEL[it.kind] ? `${KIND_LABEL[it.kind]}: ${it.label}` : it.label;
  return `Typisch für dich – ${head} (${Math.round(it.share * 100)} % deiner Filme, im Katalog ${Math.round(it.catShare * 100)} %)`;
}

// ---------------- Ähnlichkeit zwischen zwei Filmen ----------------
const SIM_WEIGHT: Partial<Record<FeatureKind, number>> = {
  genre: 0.5, subgenre: 1, thema: 0.8, regie: 1.2, drehbuch: 0.8, vorlage: 0.3, reihe: 1.5, besetzung: 0.4,
  jahrzehnt: 0.2, kamera: 0.3, musik: 0.3, genrepaar: 0.6,
};
export function simVector(t: Title, feats?: Feature[]) {
  const m = new Map<string, number>();
  for (const f of feats ?? featuresOf(t)) {
    const x = SIM_WEIGHT[f.kind] ?? (f.kind.startsWith("ki_") ? 0.3 : 0);
    if (x) m.set(f.key, x);
  }
  return m;
}
// 0–1: gewichtete Überschneidung der Merkmale
export function similarity(a: Map<string, number>, b: Map<string, number>) {
  let shared = 0, sa = 0, sb = 0;
  for (const [k, x] of a) { sa += x; if (b.has(k)) shared += x; }
  for (const x of b.values()) sb += x;
  return sa && sb ? shared / Math.sqrt(sa * sb) : 0;
}

// Gewicht einer Merkmalsart – die per Schalter zuschaltbaren Arten (Herkunft, Studio, Genre-Kombi) sonst 0
function kindWeights(opts: ScoreOptions) {
  const extra = (k: FeatureKind) =>
    k === "land" || k === "sprache" || k === "studio" ? opts.originWeight ?? 0 : k === "genrepaar" ? opts.genrePairWeight ?? 0 : null;
  return {
    taste: (k: FeatureKind) => extra(k) ?? KIND_WEIGHT[k],
    interest: (k: FeatureKind) => extra(k) ?? INTEREST_WEIGHT[k],
  };
}
// 3) Seltenheit: Merkmal, das nur wenige Katalogfilme haben, zählt mehr (z. B. "time loop" mehr als "based on novel")
const rarity = (catShare: number) => Math.max(0.3, Math.min(2, -Math.log(Math.max(catShare, 1e-4)) / Math.log(40)));

export function recommend(candidates: Title[], profile: Profile, opts: ScoreOptions = {}): Recommendation[] {
  const { prefs } = profile;
  const W = kindWeights(opts);
  const sw = opts.similarityWeight ?? 0;
  const iw = opts.interestWeight ?? DEFAULT_INTEREST;
  const qw = (opts.qualityWeight ?? DEFAULT_OPTIONS.qualityWeight) * profile.qualitySlope;
  const tw = opts.tasteWeight ?? DEFAULT_OPTIONS.tasteWeight;
  const skip = new Set(opts.skipKinds ?? []);
  const out: Recommendation[] = [];
  for (const t of candidates) {
    const feats = featuresOf(t).filter((f) => !skip.has(f.kind));
    if (!feats.length && !qw) continue;

    // Pro Merkmalsart den Durchschnitt nehmen (damit 5 Schauspieler nicht 5-fach zählen)
    const byKind = new Map<FeatureKind, Preference[]>();
    let known = 0;
    for (const f of feats) {
      const p = prefs.get(f.key);
      if (!p) continue; // unbekannt = zählt nicht (nicht neutral, nicht negativ)
      known++;
      byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), p]);
    }
    let score = 0;
    const contrib: { p: Preference; c: number }[] = [];
    for (const [kind, ps] of byKind) {
      const avg = ps.reduce((s, p) => s + p.pref, 0) / ps.length;
      score += tw * W.taste(kind) * avg;
      for (const p of ps) contrib.push({ p, c: (tw * W.taste(kind) * p.pref) / ps.length });
    }
    const q0 = qualityOf(t);
    const q = q0 == null ? null : q0 - (opts.genreQuality ? profile.genreQ.get(t.genres?.[0] ?? "") ?? 0 : 0);
    if (q != null) score += qw * (q - profile.qMean);

    // Allgemeine Eindrücke aus den kurzen Fragen (vorsichtig, höchstens ±0,6)
    score += aspectAdjust(t, profile.aspectCounts);

    // Interesse: passt die ART des Films zu dem, was du schaust?
    let topInterest: Interest | null = null;
    if (profile.interest && iw) {
      const byKindI = new Map<FeatureKind, Interest[]>();
      for (const f of feats) {
        const it = profile.interest.get(f.key);
        if (it) byKindI.set(f.kind, [...(byKindI.get(f.kind) ?? []), it]);
      }
      for (const [kind, its] of byKindI) {
        const rare = opts.rareKeywords && (kind === "thema" || kind === "subgenre");
        const ws = its.map((x) => (rare ? rarity(x.catShare) : 1));
        const mean = its.reduce((s, x, i) => s + ws[i] * x.lift, 0) / (rare ? ws.reduce((a, b) => a + b, 0) / ws.length * its.length : its.length);
        score += iw * W.interest(kind) * mean;
        for (const it of its)
          if (INTEREST_REASON_KINDS.has(kind) && it.lift > 0.4 && it.mine >= 3 && (!topInterest || it.lift * W.interest(kind) > topInterest.lift * W.interest(topInterest.kind))) topInterest = it;
      }
    }

    // Ähnlichkeit zu deinen Lieblingsfilmen (und Abstand zu Flops)
    let similarTo: { t: Title; s: number; fav: boolean } | null = null;
    if (sw && profile.anchorsPos.length) {
      const v = simVector(t, feats);
      for (const a of profile.anchorsPos) {
        if (a.t.id === t.id) continue;
        const s = similarity(v, a.v);
        if (!similarTo || s > similarTo.s) similarTo = { t: a.t, s, fav: a.fav };
      }
      let neg = 0;
      for (const a of profile.anchorsNeg) neg = Math.max(neg, similarity(v, a));
      score += sw * ((similarTo?.s ?? 0) - 0.6 * neg);
    }
    // Ganz leichter Bonus für bekannte Filme, nur als Gleichstand-Entscheider
    score += Math.log10(1 + (t.popularity ?? 0)) * 0.02;

    const reasons = contrib
      .filter((x) => x.c > 0.03 && x.p.kind !== "jahrzehnt")
      .sort((a, b) => b.c - a.c)
      .slice(0, 3)
      .map((x) => reasonText(x.p));
    if (topInterest && reasons.length < 3) reasons.unshift(interestText(topInterest));
    if (similarTo && similarTo.s >= 0.35 && reasons.length < 3)
      reasons.unshift(`Ähnlich wie „${similarTo.t.title}“${similarTo.fav ? " – einer deiner Lieblingsfilme" : ""}`);
    if (q != null && q >= 0.8 && qw >= 0.3 && reasons.length < 3)
      reasons.push(`Allgemein sehr gut bewertet (TMDB ${t.vote_average!.toLocaleString("de-DE", { maximumFractionDigits: 1 })})`);
    out.push({ title: t, score, reasons, coverage: known / feats.length });
  }
  return out.sort((a, b) => b.score - a.score);
}

// Was die App bisher über dich gelernt hat (für die Anzeige oben)
export function topPreferences(prefs: Map<string, Preference>, count = 6) {
  return [...prefs.values()]
    .filter((p) => p.n >= 2 && p.kind !== "jahrzehnt" && p.kind !== "preise")
    .sort((a, b) => b.pref - a.pref)
    .slice(0, count)
    .filter((p) => p.pref > 0.05);
}

// Vielfalt (hart, für zufällige Auswahl ohne Punkte): höchstens maxColl Filme pro Filmreihe, maxDir pro Regie.
export function diversify<T extends Title>(sorted: T[], n: number, taken: Title[] = [], maxColl = 2, maxDir = 3): T[] {
  const coll = new Map<string, number>();
  const dirs = new Map<string, number>();
  const count = (t: Title) => {
    const fr = franchiseOf(t);
    if (fr) coll.set(fr, (coll.get(fr) ?? 0) + 1);
    for (const d of t.directors ?? []) dirs.set(d, (dirs.get(d) ?? 0) + 1);
  };
  taken.forEach(count);
  const out: T[] = [];
  for (const t of sorted) {
    if (out.length >= n) break;
    const fr = franchiseOf(t);
    if (fr && (coll.get(fr) ?? 0) >= maxColl) continue;
    if ((t.directors ?? []).some((d) => (dirs.get(d) ?? 0) >= maxDir)) continue;
    out.push(t);
    count(t);
  }
  return out;
}

// Vielfalt (weich, für Vorschläge): Jeder weitere Film derselben Filmreihe bzw. derselben Regie
// bekommt einen kleinen Abzug. Passen drei MCU-Filme wirklich deutlich besser als alles andere,
// dürfen sie trotzdem alle kommen – sonst rückt Abwechslung nach.
export function pickDiverse(recs: Recommendation[], n: number): Recommendation[] {
  const pool = recs.slice(0, Math.max(n * 8, 60));
  const coll = new Map<string, number>();
  const dirs = new Map<string, number>();
  const out: Recommendation[] = [];
  while (out.length < n && pool.length) {
    let bi = 0, bv = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const t = pool[i].title;
      const fr = franchiseOf(t);
      const c = fr ? coll.get(fr) ?? 0 : 0;
      const d = Math.max(0, ...(t.directors ?? []).map((x) => dirs.get(x) ?? 0));
      // 1. Film eines Universums: kein Abzug, 2.: −0,5, 3.: −1,0 … (in "Punkten" wie die Bewertung)
      const v = pool[i].score - 0.5 * c - 0.2 * d;
      if (v > bv) { bv = v; bi = i; }
    }
    const [r] = pool.splice(bi, 1);
    out.push(r);
    const fr = franchiseOf(r.title);
    if (fr) coll.set(fr, (coll.get(fr) ?? 0) + 1);
    for (const x of r.title.directors ?? []) dirs.set(x, (dirs.get(x) ?? 0) + 1);
  }
  return out;
}

// Die stärksten Interessen (für "Was die App über dich gelernt hat")
export function topInterests(interest: Map<string, Interest> | null, count = 8) {
  if (!interest) return [];
  return [...interest.values()]
    .filter((x) => INTEREST_REASON_KINDS.has(x.kind) && x.kind !== "besetzung" && x.mine >= 4 && x.lift > 0.3)
    .filter((x) => INTEREST_WEIGHT[x.kind] > 0)
    .sort((a, b) => b.lift * INTEREST_WEIGHT[b.kind] - a.lift * INTEREST_WEIGHT[a.kind])
    .slice(0, count);
}
