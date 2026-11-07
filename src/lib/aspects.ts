// Kurze Fragen, die mit 1–2 Klicks beantwortet sind – und aus denen die App lernt.
//
// Die Fragen richten sich nach der Bewertung (deine Skala):
//   9–10 Top · 8 sehr gut · 7 gut & unterhaltsam · 6 okay · 1–5 okay bis schlecht
// Die Antworten werden möglichst konkret aus den Daten des Films gebaut (Regie, Schauspieler, Thema,
// Schauplatz, Epoche, Vorlage, Länge …). Solche Antworten entsprechen Merkmalen, die die App bei ALLEN
// Filmen kennt – sie fließen deshalb direkt in die Vorschläge ein. Allgemeine Eindrücke ("Atmosphäre")
// werden gesammelt und teilweise genutzt.

// Gründe bei "Kein Interesse"
export const REASONS = [
  { key: "genre", label: "Nicht mein Genre" },
  { key: "hart", label: "Zu brutal / düster" },
  { key: "langweilig", label: "Klingt langweilig" },
  { key: "leute", label: "Regie / Besetzung nicht meins" },
  { key: "spaeter", label: "Vielleicht später" },
] as const;
export type ReasonKey = (typeof REASONS)[number]["key"];

// Was über einen Film bekannt ist (für konkrete Antwortmöglichkeiten)
export type AspectInfo = {
  directors?: string[] | null;
  cast_names?: string[] | null;
  writers?: string[] | null;
  genres?: string[] | null;
  wd_genres?: string[] | null;
  composers?: string[] | null;
  cinematographers?: string[] | null;
  based_on?: string[] | null;
  keywords?: string[] | null;
  main_subjects?: string[] | null;
  set_in_period?: string[] | null;
  narrative_locations?: string[] | null;
  runtime_seconds?: number | null;
  certification_de?: string | null;
  collection_name?: string | null;
};
export type AspectOption = { key: string; label: string };
export type AspectGroup = { label: string; options: AspectOption[] };

const GENERIC = new Set(["Filmdrama", "Actionfilm", "Abenteuerfilm", "Filmkomödie", "Kriminalfilm", "Thriller", "Horrorfilm",
  "Science-Fiction-Film", "Fantasyfilm", "spannender Film", "Monumentalfilm", "Liebesfilm", "Animationsfilm"]);

// Häufige TMDB-Stichworte (englisch) → verständliches Deutsch
const KW_DE: Record<string, string> = {
  "twist ending": "die Wendung am Ende", "plot twist": "die Wendungen", "surprise ending": "das überraschende Ende",
  "time travel": "Zeitreise", "time loop": "Zeitschleife", heist: "der Coup", "serial killer": "Serienkiller-Jagd",
  "based on true story": "wahre Geschichte", "based on a true story": "wahre Geschichte", dystopia: "Dystopie",
  "artificial intelligence (a.i.)": "künstliche Intelligenz", "artificial intelligence": "künstliche Intelligenz", revenge: "Rache",
  friendship: "Freundschaft", "coming of age": "Erwachsenwerden", space: "Weltraum", alien: "Aliens", zombie: "Zombies",
  "nonlinear timeline": "verschachtelte Zeitebenen", investigation: "Ermittlung", courtroom: "Gerichtsdrama", "road trip": "Roadtrip",
  "world war ii": "Zweiter Weltkrieg", "vietnam war": "Vietnamkrieg", "cold war": "Kalter Krieg", biography: "Lebensgeschichte",
  sports: "Sport", boxing: "Boxen", espionage: "Spionage", spy: "Spionage", hacker: "Hacker", mafia: "Mafia",
  "organized crime": "organisiertes Verbrechen", dream: "Träume", "psychological thriller": "Psychothriller", satire: "Satire",
  "dark comedy": "schwarzer Humor", "black comedy": "schwarzer Humor", survival: "Überlebenskampf",
  "post-apocalyptic future": "Endzeit", cyberpunk: "Cyberpunk", superhero: "Superhelden", "martial arts": "Kampfkunst",
  "haunted house": "Spukhaus", "small town": "Kleinstadt", prison: "Gefängnis", journalism: "Journalismus", politics: "Politik",
  "love triangle": "Liebesdreieck", "father son relationship": "Vater-Sohn-Geschichte", "mother daughter relationship": "Mutter-Tochter-Geschichte",
  "dysfunctional family": "schwierige Familie", "mental illness": "psychische Krankheit", addiction: "Sucht", drugs: "Drogen",
  "corrupt cop": "korrupte Polizei", "cat and mouse": "Katz-und-Maus-Spiel", conspiracy: "Verschwörung", "drug cartel": "Drogenkartell",
  "hitman": "Auftragskiller", assassin: "Auftragskiller", "bank robbery": "Banküberfall", "kidnapping": "Entführung",
  "virtual reality": "virtuelle Realität", "parallel world": "Parallelwelt", "existentialism": "Sinnfragen", "loneliness": "Einsamkeit",
  "music": "Musik", "musician": "Musiker", "writer": "Schriftsteller", "wall street": "Finanzwelt", "stock market": "Finanzwelt",
  "racism": "Rassismus", "slavery": "Sklaverei", "terrorism": "Terrorismus", "police": "Polizei", "detective": "Detektiv",
  "unreliable narrator": "unzuverlässiger Erzähler", "mindfuck": "Kopfkino", "puzzle": "Rätsel", "hostage": "Geiselnahme",
};
const NOISE = new Set(["duringcreditsstinger", "aftercreditsstinger", "woman director", "sequel", "remake", "based on novel or book",
  "based on comic", "3d", "imax", "live action remake", "shot on imax", "independent film", "male protagonist"]);

// Wie stark eine Antwort zählt – je nach Bewertung (für das Lernen in recommend.ts)
export function aspectStrength(sign: 1 | -1, rating: number | null | undefined) {
  const r = rating ?? 7;
  if (sign > 0) return r >= 9 ? 1 : r >= 8 ? 0.8 : r >= 7 ? 0.5 : r >= 6 ? 0.3 : 0.2;
  return r <= 3 ? 1 : r <= 5 ? 0.8 : r <= 6 ? 0.6 : r <= 7 ? 0.4 : 0.3;
}

// Überschrift je nach Bewertung
export function aspectTitle(rating: number) {
  if (rating >= 9) return "Was macht ihn für dich zum Top-Film?";
  if (rating >= 8) return "Was hat ihn sehr gut gemacht?";
  if (rating >= 7) return "Gut unterhalten – was hat gepasst, was fehlte zur 8?";
  if (rating >= 6) return "Nur okay – was hat gefehlt?";
  return "Was hat dich gestört?";
}

// Artikel weg, für "Thema „Coup“ nicht meins"
const bare = (s: string) => s.replace(/^(der|die|das) /, "");

function positives(t: AspectInfo, strong: boolean): { concrete: AspectOption[]; general: AspectOption[] } {
  const o: AspectOption[] = [];
  const g: AspectOption[] = [];
  const d = t.directors?.[0];
  const sub = (t.wd_genres ?? []).find((g) => !GENERIC.has(g));
  const kind = t.based_on?.find((b) => b.includes(":"));
  const kws = (t.keywords ?? []).slice(0, 15).filter((k) => !NOISE.has(k));
  const known = kws.filter((k) => KW_DE[k.toLowerCase()]);
  const subjects = (t.main_subjects ?? []).filter((s) => !s.startsWith("Person:")).slice(0, 2);
  // 1) Konkretes aus dem Film zuerst
  for (const k of known.slice(0, 3)) o.push({ key: `+thema:${k}`, label: cap(KW_DE[k.toLowerCase()]) });
  for (const s of subjects) o.push({ key: `+thema:${s}`, label: `Thema: ${s}` });
  if (d) o.push({ key: `+regie:${d}`, label: `Regie von ${d}` });
  for (const a of (t.cast_names ?? []).slice(0, 2)) o.push({ key: `+besetzung:${a}`, label: a });
  if (t.composers?.[0]) o.push({ key: `+musik:${t.composers[0]}`, label: `Filmmusik von ${t.composers[0]}` });
  if (t.writers?.[0] && t.writers[0] !== d) o.push({ key: `+drehbuch:${t.writers[0]}`, label: `Drehbuch (${t.writers[0]})` });
  if (sub) o.push({ key: `+subgenre:${sub}`, label: sub });
  if (t.set_in_period?.[0]) o.push({ key: `+thema:zeit:${t.set_in_period[0]}`, label: `Spielt: ${t.set_in_period[0]}` });
  if (t.narrative_locations?.[0]) o.push({ key: `+thema:ort:${t.narrative_locations[0]}`, label: `Schauplatz: ${t.narrative_locations[0]}` });
  if (kind) o.push({ key: `+vorlage:${kind.split(":")[0]}`, label: `Die Vorlage (${kind.split(":").slice(1).join(":").trim() || kind})` });
  if (t.cinematographers?.[0]) o.push({ key: `+kamera:${t.cinematographers[0]}`, label: "Die Bilder / Kamera" });
  // 2) Allgemeine Eindrücke
  g.push({ key: "+aspekt:story", label: "Die Geschichte" });
  g.push({ key: "+aspekt:spannung", label: "Spannung" });
  g.push({ key: "+aspekt:figuren", label: "Die Figuren" });
  g.push({ key: "+aspekt:atmosphaere", label: "Atmosphäre" });
  if (!t.composers?.[0]) g.push({ key: "+aspekt:musik", label: "Filmmusik" });
  if (strong) {
    g.push({ key: "+aspekt:gefuehl", label: "Hat mich berührt" });
    g.push({ key: "+aspekt:tiefgang", label: "Regt zum Nachdenken an" });
    g.push({ key: "+aspekt:ende", label: "Das Ende" });
  }
  g.push({ key: "+aspekt:humor", label: "Humor" });
  g.push({ key: "+aspekt:dialoge", label: "Dialoge" });
  return { concrete: o, general: g };
}

function negatives(t: AspectInfo, mild: boolean): AspectOption[] {
  const o: AspectOption[] = [];
  const d = t.directors?.[0];
  const min = t.runtime_seconds ? Math.round(t.runtime_seconds / 60) : null;
  const kws = (t.keywords ?? []).slice(0, 15).filter((k) => !NOISE.has(k) && KW_DE[k.toLowerCase()]);
  if (mild) {
    // "Was fehlte?" (bei 6–7)
    o.push({ key: "-aspekt:spannung", label: "Mehr Spannung" });
    o.push({ key: "-aspekt:tiefgang", label: "Mehr Tiefgang" });
    o.push({ key: "-aspekt:figuren", label: "Stärkere Figuren" });
    o.push({ key: "-aspekt:ende", label: "Ein besseres Ende" });
    o.push({ key: "-aspekt:vorhersehbar", label: "Weniger vorhersehbar" });
    if (min && min > 130) o.push({ key: "-aspekt:langatmig", label: `Kürzer (${min} Min. waren zu viel)` });
    else o.push({ key: "-aspekt:langatmig", label: "Mehr Tempo" });
    o.push({ key: "-aspekt:humor", label: "Besserer Humor" });
    o.push({ key: "-aspekt:story", label: "Eine originellere Geschichte" });
  } else {
    // "Was hat gestört?" (bis 5)
    o.push({ key: "-aspekt:story", label: "Schwache Geschichte" });
    if (min && min > 130) o.push({ key: "-aspekt:langatmig", label: `Zu lang (${min} Min.)` });
    else o.push({ key: "-aspekt:langatmig", label: "Zu langatmig" });
    o.push({ key: "-aspekt:vorhersehbar", label: "Zu vorhersehbar" });
    o.push({ key: "-aspekt:figuren", label: "Figuren egal" });
    if (t.certification_de === "16" || t.certification_de === "18") o.push({ key: "-aspekt:brutal", label: `Zu brutal (FSK ${t.certification_de})` });
    o.push({ key: "-aspekt:kitsch", label: "Zu kitschig" });
    o.push({ key: "-aspekt:laut", label: "Zu viel Action / Krach" });
    o.push({ key: "-aspekt:humor", label: "Humor nicht meins" });
  }
  // Konkretes aus dem Film, das nicht gefallen hat
  for (const k of kws.slice(0, 2)) o.push({ key: `-thema:${k}`, label: `Thema „${cap(bare(KW_DE[k.toLowerCase()]))}“ nicht meins` });
  const genre = t.genres?.[0];
  if (genre && !mild) o.push({ key: `-genre:${genre}`, label: `${genre} ist nicht mein Genre` });
  if (d) o.push({ key: `-regie:${d}`, label: `Regie von ${d} nicht meins` });
  if (t.composers?.[0]) o.push({ key: `-musik:${t.composers[0]}`, label: `Filmmusik (${t.composers[0]}) passte nicht` });
  else o.push({ key: "-aspekt:musik", label: "Filmmusik passte nicht" });
  for (const a of (t.cast_names ?? []).slice(0, 2)) o.push({ key: `-besetzung:${a}`, label: `${a} überzeugt mich nicht` });
  if (t.collection_name) o.push({ key: "-aspekt:fortsetzung", label: `Reihe „${t.collection_name}“ ist ausgereizt` });
  return o;
}

// Antwortmöglichkeiten passend zur Bewertung – eine oder zwei Gruppen
export function aspectGroups(t: AspectInfo, rating: number): AspectGroup[] {
  if (rating >= 8) {
    const p = positives(t, true);
    return [
      { label: "Am Film selbst", options: p.concrete.slice(0, 10) },
      { label: "Allgemein", options: p.general },
    ].filter((g) => g.options.length);
  }
  if (rating >= 7) {
    const p = positives(t, false);
    return [
      { label: "Was hat gepasst?", options: [...p.concrete.slice(0, 7), ...p.general.slice(0, 3)] },
      { label: "Was fehlte zur 8?", options: negatives(t, true).slice(0, 8) },
    ];
  }
  if (rating >= 6) {
    const p = positives(t, false);
    return [
      { label: "Was hat gefehlt?", options: negatives(t, true).slice(0, 11) },
      { label: "Was war trotzdem gut?", options: [...p.concrete.slice(0, 5), ...p.general.slice(0, 2)] },
    ];
  }
  return [{ label: "", options: negatives(t, false) }];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Wann gefragt wird: ohne "ausführlich" nur bei klaren Urteilen (ab 8 oder bis 4) und nur bei jedem 3.;
// im ausführlichen Modus nach jeder Bewertung.
const COUNTER = "ff-frage-zaehler";
export const DETAIL_KEY = "ff-ausfuehrlich";
export function detailMode() {
  try { return localStorage.getItem(DETAIL_KEY) === "1"; } catch { return false; }
}
export function shouldAskAspects(rating: number | null): number | null {
  if (rating == null) return null;
  if (detailMode()) return rating;
  if (!(rating >= 8 || rating <= 4)) return null;
  let n = 0;
  try { n = Number(localStorage.getItem(COUNTER) ?? 0) + 1; localStorage.setItem(COUNTER, String(n)); } catch {}
  return n % 3 === 1 ? rating : null; // 1., 4., 7. … klare Urteil
}
