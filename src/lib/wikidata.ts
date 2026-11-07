// Zusätzliche Filmdaten von Wikidata (frei nutzbar, CC0).
// Gefunden wird jeder Film über seine TMDB-ID (Wikidata-Eigenschaft P4947).
//
//  P144  basiert auf          → based_on            z. B. "Buch: Der Pate"
//  P136  Genre                → wd_genres           z. B. "Neo-Noir"
//  P840  Handlungsort         → narrative_locations z. B. "New York City"
//  P2408 Zeit der Handlung    → set_in_period       z. B. "1950er"
//  P921  Hauptthema           → main_subjects       z. B. "Person: Mark Aurel"
//  P462  Farbe                → black_and_white     Schwarzweiß ja/nein
//  P2130 Kosten               → budget_usd          Budget in US-Dollar
//  P2142 Einspielergebnis     → box_office_usd      möglichst weltweit, in US-Dollar
//  P1411 nominiert für        → nominations         z. B. "Oscar für den besten Film"
//  P915  Drehort              → filming_locations   z. B. "Malta"

// Wenn sich die Abfrage ändert, Version erhöhen – dann werden alle Filme neu abgefragt.
export const WIKIDATA_VERSION = 2;

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "FilmfinderHobbyProject/0.1 (private, non-commercial)";

export type WikidataInfo = {
  based_on: string[];
  wd_genres: string[];
  narrative_locations: string[];
  set_in_period: string[];
  main_subjects: string[];
  black_and_white: boolean | null;
  budget_usd: number | null;
  box_office_usd: number | null;
  nominations: string[];
  filming_locations: string[];
};

// Wikidata-Klassen → verständliche Art der Vorlage
const SOURCE_KIND: Record<string, string> = {
  Q7725634: "Buch", Q8261: "Buch", Q571: "Buch", Q47461344: "Buch", Q49084: "Buch", Q149537: "Buch",
  Q1667921: "Buch", Q277759: "Buch", Q112983: "Buch", Q17537576: "Buch",
  Q1004: "Comic", Q838795: "Comic", Q14406742: "Comic", Q725377: "Comic", Q21198342: "Comic", Q1760610: "Comic",
  Q11424: "Film", Q506240: "Film", Q24869: "Film",
  Q5398426: "Serie", Q7889: "Videospiel", Q25379: "Theaterstück", Q7777573: "Theaterstück", Q2743: "Musical",
  Q5: "wahre Person", Q1190554: "wahres Ereignis", Q1656682: "wahres Ereignis", Q13418847: "wahres Ereignis",
};

const LABEL = `
  OPTIONAL { ?v rdfs:label ?de . FILTER(LANG(?de) = "de") }
  OPTIONAL { ?v rdfs:label ?en . FILTER(LANG(?en) = "en") }
  BIND(COALESCE(?de, ?en) AS ?label)`;

async function sparql(query: string): Promise<Record<string, { value: string }>[]> {
  const res = await fetch(ENDPOINT + "?query=" + encodeURIComponent(query), {
    headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Wikidata-Fehler ${res.status}`);
  const j = await res.json();
  return j.results.bindings;
}

// Holt die Zusatzinfos für viele Filme auf einmal (empfohlen: bis 150 TMDB-IDs).
export async function wikidataInfo(tmdbIds: number[]): Promise<Map<number, WikidataInfo>> {
  const values = tmdbIds.map((id) => `"${id}"`).join(" ");
  const out = new Map<number, WikidataInfo>();
  const get = (id: number) => {
    let e = out.get(id);
    if (!e) {
      e = {
        based_on: [], wd_genres: [], narrative_locations: [], set_in_period: [], main_subjects: [],
        black_and_white: null, budget_usd: null, box_office_usd: null, nominations: [], filming_locations: [],
      };
      out.set(id, e);
    }
    return e;
  };
  const push = (arr: string[], v: string, max: number) => { if (v && !arr.includes(v) && arr.length < max) arr.push(v); };

  // Alle fünf Abfragen gleichzeitig (deutlich schneller als nacheinander)
  const simple = (prop: string) => sparql(`SELECT DISTINCT ?tmdb ?label WHERE {
      VALUES ?tmdb { ${values} } ?film wdt:P4947 ?tmdb ; wdt:${prop} ?v . ${LABEL}
    }`);
  const [based, genres, locs, periods, subj] = await Promise.all([
  // basiert auf (mit Art der Vorlage)
  sparql(`SELECT ?tmdb ?label (GROUP_CONCAT(DISTINCT STRAFTER(STR(?t), "entity/"); separator=",") AS ?types) WHERE {
    VALUES ?tmdb { ${values} } ?film wdt:P4947 ?tmdb ; wdt:P144 ?v . OPTIONAL { ?v wdt:P31 ?t . } ${LABEL}
  } GROUP BY ?tmdb ?label`),
    simple("P136"),
    simple("P840"),
    simple("P2408"),
    // Hauptthema (echte Personen gekennzeichnet)
    sparql(`SELECT DISTINCT ?tmdb ?label ?human WHERE {
    VALUES ?tmdb { ${values} } ?film wdt:P4947 ?tmdb ; wdt:P921 ?v .
    BIND(EXISTS { ?v wdt:P31 wd:Q5 } AS ?human) ${LABEL}
  }`),
  ]);
  for (const b of based) {
    if (!b.label) continue;
    const kinds = (b.types?.value ?? "").split(",").map((q) => SOURCE_KIND[q]).filter(Boolean);
    const kind = kinds.includes("wahre Person") ? "wahre Person" : kinds[0];
    push(get(Number(b.tmdb.value)).based_on, kind ? `${kind}: ${b.label.value}` : b.label.value, 4);
  }

  for (const [rows, key, max] of [[genres, "wd_genres", 8], [locs, "narrative_locations", 4], [periods, "set_in_period", 4]] as const) {
    for (const r of rows) if (r.label) push(get(Number(r.tmdb.value))[key], r.label.value, max);
  }

  for (const r of subj) {
    if (!r.label) continue;
    push(get(Number(r.tmdb.value)).main_subjects, r.human?.value === "true" ? `Person: ${r.label.value}` : r.label.value, 6);
  }
  // Zweite Runde (Wikidata erlaubt höchstens 5 Abfragen gleichzeitig)
  const money = (prop: string) => sparql(`SELECT ?tmdb ?amount ?scope WHERE {
    VALUES ?tmdb { ${values} } ?film wdt:P4947 ?tmdb ; p:${prop} ?s .
    ?s psv:${prop} [ wikibase:quantityAmount ?amount ; wikibase:quantityUnit wd:Q4917 ] .
    OPTIONAL { ?s pq:P3005 ?scope . }
  }`);
  const [colors, budgets, boxes, noms, filming] = await Promise.all([
    sparql(`SELECT ?tmdb ?c WHERE { VALUES ?tmdb { ${values} } ?film wdt:P4947 ?tmdb ; wdt:P462 ?c . }`),
    money("P2130"),
    money("P2142"),
    sparql(`SELECT DISTINCT ?tmdb ?label WHERE { VALUES ?tmdb { ${values} } ?film wdt:P4947 ?tmdb ; wdt:P1411 ?v . ${LABEL} }`),
    sparql(`SELECT DISTINCT ?tmdb ?label WHERE { VALUES ?tmdb { ${values} } ?film wdt:P4947 ?tmdb ; wdt:P915 ?v . ${LABEL} }`),
  ]);
  for (const r of colors) {
    const e = get(Number(r.tmdb.value));
    const bw = r.c.value.endsWith("/Q838368"); // Schwarzweiß
    e.black_and_white = e.black_and_white === true || bw; // Mischformen zählen als Schwarzweiß-Anteil
  }
  for (const r of budgets) {
    const e = get(Number(r.tmdb.value));
    const v = Math.round(Number(r.amount.value));
    if (v > 0 && (e.budget_usd == null || v > e.budget_usd)) e.budget_usd = v;
  }
  // Einspielergebnis: weltweiter Wert hat Vorrang, sonst der größte bekannte
  const worldwide = new Map<number, number>();
  for (const r of boxes) {
    const id = Number(r.tmdb.value);
    const v = Math.round(Number(r.amount.value));
    if (!(v > 0)) continue;
    const e = get(id);
    if (r.scope?.value.endsWith("/Q13780930")) worldwide.set(id, Math.max(worldwide.get(id) ?? 0, v));
    if (e.box_office_usd == null || v > e.box_office_usd) e.box_office_usd = v;
  }
  for (const [id, v] of worldwide) get(id).box_office_usd = v;
  for (const r of noms) if (r.label) push(get(Number(r.tmdb.value)).nominations, r.label.value, 25);
  for (const r of filming) if (r.label) push(get(Number(r.tmdb.value)).filming_locations, r.label.value, 6);

  return out;
}
