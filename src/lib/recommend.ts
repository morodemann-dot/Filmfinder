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

export type RatedTitle = Title & { rating: number | null; status: string };

export type FeatureKind =
  | "genre" | "regie" | "besetzung" | "reihe" | "jahrzehnt" | "preise"
  | "subgenre" | "thema" | "drehbuch" | "kamera" | "musik" | "vorlage" | "stil" | "budget";

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

export type ScoreOptions = {
  qualityWeight?: number; // 1 = so stark, wie es zu deinen Bewertungen passt; 0 = ignorieren
  tasteWeight?: number; // wie stark dein persönlicher Geschmack zählt (wird per Messtest gewählt)
  shrink?: number; // Vorsicht bei wenigen Belegen (mehr = vorsichtiger)
  skipKinds?: FeatureKind[]; // Merkmalsarten weglassen (nur für den Messtest)
};
export const DEFAULT_OPTIONS: Required<Omit<ScoreOptions, "skipKinds">> = { qualityWeight: 1, tasteWeight: 1, shrink: 2 }; // "Vorsicht": so viele gedachte neutrale Beobachtungen kommen immer dazu

type Feature = { key: string; kind: FeatureKind; label: string };

function featuresOf(t: Title): Feature[] {
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
  for (const w of (t.writers ?? []).slice(0, 3)) f.push({ key: `drehbuch:${w}`, kind: "drehbuch", label: w });
  for (const c of t.cinematographers ?? []) f.push({ key: `kamera:${c}`, kind: "kamera", label: c });
  for (const c of t.composers ?? []) f.push({ key: `musik:${c}`, kind: "musik", label: c });
  for (const b of t.based_on ?? []) {
    const kind = b.includes(":") ? b.split(":")[0] : null; // "Buch", "Comic", "wahre Person" …
    if (kind) f.push({ key: `vorlage:${kind}`, kind: "vorlage", label: `nach ${kind === "wahre Person" ? "wahrer Geschichte" : kind}` });
  }
  if (t.black_and_white) f.push({ key: "stil:sw", kind: "stil", label: "Schwarzweiß-Filme" });
  if ((t.nominations?.length ?? 0) >= 5) f.push({ key: "preise:nominiert", kind: "preise", label: "Viel nominierte Filme" });
  if (t.budget_usd) {
    const b = t.budget_usd;
    const [key, label] = b >= 100e6 ? ["gross", "Großproduktionen"] : b < 20e6 ? ["klein", "Kleinere Produktionen"] : ["mittel", "Mittleres Budget"];
    f.push({ key: `budget:${key}`, kind: "budget", label });
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

export function buildProfile(rated: RatedTitle[], opts: ScoreOptions = {}) {
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
  for (const r of rated) {
    // Gelernt wird nur, was von der Erwartung abweicht: Mag jemand Nolan nur, weil Nolan-Filme
    // allgemein gut sind, ist das schon über die Qualität abgedeckt und zählt hier nicht doppelt.
    if (r.status === "gesehen" && r.rating) add(r, r.rating - expected(r), 1, r.rating);
    else if (r.status === "nicht_interessiert") add(r, -2, 0.5, null); // schwaches Minus
    else if (r.status === "merkliste") add(r, 1, 0.3, null); // sehr schwaches Plus
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
  return { prefs, ratedCount: withRating.length, meanScore: mean, qMean, qualitySlope: slope };
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

export function recommend(candidates: Title[], profile: Profile, opts: ScoreOptions = {}): Recommendation[] {
  const { prefs } = profile;
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
      score += tw * KIND_WEIGHT[kind] * avg;
      for (const p of ps) contrib.push({ p, c: (tw * KIND_WEIGHT[kind] * p.pref) / ps.length });
    }
    const q = qualityOf(t);
    if (q != null) score += qw * (q - profile.qMean);
    // Ganz leichter Bonus für bekannte Filme, nur als Gleichstand-Entscheider
    score += Math.log10(1 + (t.popularity ?? 0)) * 0.02;

    const reasons = contrib
      .filter((x) => x.c > 0.03 && x.p.kind !== "jahrzehnt")
      .sort((a, b) => b.c - a.c)
      .slice(0, 3)
      .map((x) => reasonText(x.p));
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
