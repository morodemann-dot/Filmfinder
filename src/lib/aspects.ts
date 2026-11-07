// Kurze Fragen, die mit 1–2 Klicks beantwortet sind – und aus denen die App lernt.

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
  genres?: string[] | null;
  wd_genres?: string[] | null;
  composers?: string[] | null;
  cinematographers?: string[] | null;
  based_on?: string[] | null;
};
export type AspectOption = { key: string; label: string };

const GENERIC = new Set(["Filmdrama", "Actionfilm", "Abenteuerfilm", "Filmkomödie", "Kriminalfilm", "Thriller", "Horrorfilm",
  "Science-Fiction-Film", "Fantasyfilm", "spannender Film", "Monumentalfilm", "Liebesfilm", "Animationsfilm"]);

// Antwortmöglichkeiten. Schlüssel mit "+"/"−" davor; nach dem Präfix entsprechen sie den Merkmalen
// der Empfehlung (z. B. "regie:Christopher Nolan"), "aspekt:…" sind allgemeine Eindrücke.
export function aspectOptions(t: AspectInfo, positive: boolean): AspectOption[] {
  const s = positive ? "+" : "-";
  const o: AspectOption[] = [];
  const d = t.directors?.[0];
  const sub = (t.wd_genres ?? []).find((g) => !GENERIC.has(g));
  const genre = t.genres?.[0];
  const kind = t.based_on?.find((b) => b.includes(":"))?.split(":")[0];
  if (positive) {
    o.push({ key: "+aspekt:story", label: "Die Geschichte" });
    if (d) o.push({ key: `+regie:${d}`, label: `Regie: ${d}` });
    for (const a of (t.cast_names ?? []).slice(0, 2)) o.push({ key: `+besetzung:${a}`, label: a });
    o.push({ key: "+aspekt:spannung", label: "Spannung" });
    o.push({ key: "+aspekt:atmosphaere", label: "Atmosphäre" });
    o.push({ key: "+aspekt:gefuehl", label: "Emotionen" });
    o.push({ key: "+aspekt:wendungen", label: "Wendungen" });
    o.push({ key: "+aspekt:humor", label: "Humor" });
    o.push({ key: "+aspekt:schauspiel", label: "Schauspiel" });
    if (sub) o.push({ key: `+subgenre:${sub}`, label: sub });
    else if (genre) o.push({ key: `+genre:${genre}`, label: `Genre: ${genre}` });
    if (t.composers?.[0]) o.push({ key: `+musik:${t.composers[0]}`, label: `Musik (${t.composers[0]})` });
    if (t.cinematographers?.[0]) o.push({ key: `+kamera:${t.cinematographers[0]}`, label: "Bilder / Kamera" });
    if (kind) o.push({ key: `+vorlage:${kind}`, label: `Die Vorlage (${kind})` });
  } else {
    o.push({ key: "-aspekt:story", label: "Schwache Geschichte" });
    o.push({ key: "-aspekt:langatmig", label: "Zu langatmig" });
    o.push({ key: "-aspekt:vorhersehbar", label: "Zu vorhersehbar" });
    o.push({ key: "-aspekt:brutal", label: "Zu brutal" });
    o.push({ key: "-aspekt:kitsch", label: "Zu kitschig" });
    o.push({ key: "-aspekt:laut", label: "Zu viel Action / Krach" });
    o.push({ key: "-aspekt:humor", label: "Humor nicht meins" });
    if (genre) o.push({ key: `-genre:${genre}`, label: `Genre (${genre}) nicht meins` });
    if (d) o.push({ key: `-regie:${d}`, label: `Regie: ${d}` });
    for (const a of (t.cast_names ?? []).slice(0, 2)) o.push({ key: `-besetzung:${a}`, label: a });
  }
  return o.map((x) => ({ ...x, key: x.key.replace(/^[+-]/, s) }));
}

// Wann gefragt wird: bei klaren Urteilen (ab 8 oder bis 4), sonst nur im ausführlichen Modus –
// und ohne ausführlichen Modus nur bei jedem 3. klaren Urteil (nicht nerven!)
const COUNTER = "ff-frage-zaehler";
export const DETAIL_KEY = "ff-ausfuehrlich";
export function detailMode() {
  try { return localStorage.getItem(DETAIL_KEY) === "1"; } catch { return false; }
}
export function shouldAskAspects(rating: number | null): "pos" | "neg" | null {
  if (rating == null) return null;
  const detail = detailMode();
  const strong = rating >= 8 || rating <= 4;
  if (!strong && !detail) return null;
  if (!detail) {
    let n = 0;
    try { n = Number(localStorage.getItem(COUNTER) ?? 0) + 1; localStorage.setItem(COUNTER, String(n)); } catch {}
    if (n % 3 !== 1) return null; // 1., 4., 7. … klare Urteil
  }
  return rating >= 6 ? "pos" : "neg";
}
