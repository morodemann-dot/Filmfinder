// Filmnetz: verbindet Filme über ihre MERKMALE – bewusst OHNE TMDB-Empfehlungen ("was andere schauten").
//
// Drei Ebenen, damit auch tiefere Verbindungen entstehen:
// 1) Direkte Gemeinsamkeiten: Genre, feines Genre, alle Stichworte/Themen, Regie, Drehbuch, Besetzung (bis Rolle 10,
//    Hauptrollen zählen mehr), Kamera, Musik, Reihe, Vorlage, Zeit (Jahre nah beieinander), Länge, Land, Sprache …
// 2) Verwandte Themen: Stichworte, die im Katalog oft zusammen vorkommen ("Astronaut" ~ "Weltraum" ~ "Mars"),
//    verbinden schwach mit – so finden sich Filme, die dasselbe Thema mit anderen Stichworten beschreiben.
// 3) Vielfalt der Verbindungen: Ein einzelnes starkes Merkmal (z. B. "Regie: Nolan") darf höchstens 3 der
//    Verbindungen eines Films stellen – die übrigen Plätze gehen an Filme, die auf andere Weise ähnlich sind.
import { GENERIC_SUBGENRES, KIND_NAMES, NOISE_KEYWORDS, type FeatureKind } from "./recommend";
import type { Title } from "./types";

const K = 15; // höchstens so viele Verbindungen sucht sich jeder Film
const SAME_REASON_MAX = 4; // höchstens so viele Verbindungen über dieselbe Person/Reihe als Hauptgrund
const SUBSTANCE_MIN = 0.45; // so viel der Ähnlichkeit muss aus echten Inhalten kommen (nicht nur Genre/Zeit/Länge/Land)
const MIN_SIM = 0.1; // schwächere Ähnlichkeit = keine Verbindung
const MAX_DF = 500; // sehr häufige Merkmale nur beim genauen Nachrechnen berücksichtigen
const IDF_CAP = 6.5; // Einzelstücke (z. B. Nebendarsteller in nur 2 Filmen) nicht übermächtig werden lassen
const RELATED = 0.35; // Gewicht verwandter Themen

type Kind = FeatureKind | "zeit" | "laenge" | "verwandt";
const W: Partial<Record<Kind, number>> = {
  reihe: 1.5, regie: 1.3, drehbuch: 1, subgenre: 1.2, thema: 1, besetzung: 1, musik: 0.8, kamera: 0.6,
  genrepaar: 0.5, genre: 0.6, vorlage: 0.6, zeit: 0.4, laenge: 0.3, sprache: 0.4, studio: 0.3, stil: 0.4, land: 0.3, budget: 0.2,
};

export const NET_GENRES = ["Action", "Abenteuer", "Animation", "Komödie", "Krimi", "Dokumentarfilm", "Drama", "Familie",
  "Fantasy", "Historie", "Horror", "Musik", "Mystery", "Liebesfilm", "Science Fiction", "Thriller", "Kriegsfilm", "Western"];

export type NetNode = { id: number; t: string; y: number | null; g: number; p?: string | null };
export type NetData = { nodes: NetNode[]; edges: number[]; genres: string[] }; // edges: [i, j, Ähnlichkeit×1000, …]
type Vec = { keys: string[]; w: Float64Array; norm: number; labels: Map<string, string>; ids: Int32Array; iw: Float64Array };
export type Net = NetData & { vecs: Vec[]; byId: Map<number, number>; titles: Title[] };

const NAME: Partial<Record<Kind, string>> = { thema: "Thema", subgenre: "Genre", genre: "Genre", genrepaar: "Genre-Mix", reihe: "Reihe", zeit: "Zeit", laenge: "Länge" };
const nameOf = (k: Kind) => NAME[k] ?? KIND_NAMES[k as FeatureKind] ?? k;

// Merkmale eines Films für das Netz (eigene, breitere Auswahl als bei den Vorschlägen)
function netFeatures(t: Title): { key: string; kind: Kind; label: string; f: number }[] {
  const out: { key: string; kind: Kind; label: string; f: number }[] = [];
  const add = (kind: Kind, key: string, label: string, f = 1) => out.push({ key: `${kind}:${key}`, kind, label: `${nameOf(kind)}: ${label}`, f });
  for (const g of t.genres ?? []) add("genre", g, g);
  const gs = (t.genres ?? []).slice(0, 3).slice().sort();
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) add("genrepaar", `${gs[i]}+${gs[j]}`, `${gs[i]} + ${gs[j]}`);
  for (const g of t.wd_genres ?? []) if (!GENERIC_SUBGENRES.has(g)) add("subgenre", g, g);
  for (const k of t.keywords ?? []) if (!NOISE_KEYWORDS.has(k)) add("thema", k, k);
  for (const m of t.main_subjects ?? []) add("thema", m, m.replace(/^Person: /, ""));
  for (const p of t.set_in_period ?? []) add("thema", `zeit:${p}`, `spielt ${p}`, 0.8);
  for (const l of t.narrative_locations ?? []) add("thema", `ort:${l}`, `Schauplatz ${l}`, 0.6);
  for (const d of t.directors ?? []) add("regie", d, d);
  for (const w of (t.writers ?? []).slice(0, 3)) add("drehbuch", w, w);
  (t.cast_names ?? []).slice(0, 10).forEach((a, i) => add("besetzung", a, a, 1 - i * 0.06)); // Hauptrollen zählen mehr
  for (const c of t.cinematographers ?? []) add("kamera", c, c);
  for (const c of t.composers ?? []) add("musik", c, c);
  if (t.collection_id && t.collection_name) add("reihe", String(t.collection_id), t.collection_name);
  for (const b of t.based_on ?? []) {
    const k = b.includes(":") ? b.split(":")[0] : null;
    if (k) add("vorlage", k, k === "wahre Person" ? "wahre Geschichte" : k);
  }
  if (t.release_year) {
    // überlappende 6-Jahres-Fenster: 2014 und 2015 landen sicher zusammen
    const y = t.release_year;
    for (const s of [Math.floor(y / 6) * 6, Math.floor((y + 3) / 6) * 6 - 3]) add("zeit", String(s), `${s}–${s + 5}`, 0.7);
  }
  const min = t.runtime_seconds ? t.runtime_seconds / 60 : null;
  if (min) for (const [lo, hi, lbl] of [[0, 100, "kurz"], [90, 125, "mittel"], [115, 150, "lang"], [140, 999, "sehr lang"]] as const)
    if (min >= lo && min < hi) add("laenge", lbl, lbl);
  for (const c of (t.countries ?? []).slice(0, 2)) add("land", c, c);
  if (t.original_language) add("sprache", t.original_language, t.original_language.toUpperCase());
  for (const st of (t.studios ?? []).slice(0, 2)) add("studio", st, st);
  if (t.black_and_white) add("stil", "sw", "Schwarzweiß");
  if (t.budget_usd) add("budget", t.budget_usd >= 100e6 ? "gross" : t.budget_usd < 20e6 ? "klein" : "mittel",
    t.budget_usd >= 100e6 ? "Großproduktion" : t.budget_usd < 20e6 ? "kleinere Produktion" : "mittleres Budget");
  return out;
}

// "Echte Inhalte": was einen Film ausmacht. Genre, Zeit, Länge, Land, Sprache, Studio, Budget sind nur Beiwerk –
// eine Verbindung allein darüber wäre nicht logisch.
const SUBSTANCE = ["thema:", "subgenre:", "regie:", "drehbuch:", "besetzung:", "musik:", "kamera:", "reihe:", "vorlage:"];
const PEOPLE = ["regie:", "drehbuch:", "besetzung:", "musik:", "kamera:", "reihe:"];
const cache = new WeakMap<Title[], Net>();
// Der Katalog wird alle 10 Min. neu geladen (neues Objekt) – das Netz nur neu rechnen, wenn sich wirklich etwas geändert hat
let lastNet: { sig: string; at: number; net: Net } | null = null;
const NET_TTL = 12 * 3600_000;
export function buildNet(catalog: Title[]): Net {
  const hit = cache.get(catalog);
  if (hit) return hit;
  let sum = 0; for (const t of catalog) sum = (sum + t.id * 31 + (t.keywords?.length ?? 0)) % 2_147_483_647;
  const sig = `${catalog.length}:${sum}`;
  if (lastNet && lastNet.sig === sig && Date.now() - lastNet.at < NET_TTL) { cache.set(catalog, lastNet.net); return lastNet.net; }
  const net = computeNet(catalog);
  lastNet = { sig, at: Date.now(), net };
  cache.set(catalog, net);
  return net;
}

function computeNet(catalog: Title[]): Net {
  const T0 = Date.now(), lap: Record<string, number> = {};
  const titles = catalog.filter((t) => t.media_type === "movie" || !t.media_type);
  const N = titles.length;

  // 1) Merkmale je Film und wie viele Filme jedes Merkmal haben
  const raw = titles.map((t) => {
    const m = new Map<string, { kind: Kind; label: string; f: number }>();
    for (const f of netFeatures(t)) if (W[f.kind] && !m.has(f.key)) m.set(f.key, f);
    return m;
  });
  const df = new Map<string, number>();
  for (const m of raw) for (const k of m.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const idf = (k: string) => Math.min(IDF_CAP, Math.log(N / (df.get(k) ?? 1)));

  lap.merkmale = Date.now() - T0;
  // 2) Verwandte Themen: Stichworte, die überdurchschnittlich oft gemeinsam vorkommen
  const co = new Map<string, Map<string, number>>();
  for (const m of raw) {
    const th = [...m.keys()].filter((k) => k.startsWith("thema:") && (df.get(k) ?? 0) >= 3 && (df.get(k) ?? 0) <= MAX_DF);
    for (let a = 0; a < th.length; a++) for (let b = a + 1; b < th.length; b++) {
      for (const [x, y] of [[th[a], th[b]], [th[b], th[a]]]) {
        let row = co.get(x); if (!row) co.set(x, (row = new Map()));
        row.set(y, (row.get(y) ?? 0) + 1);
      }
    }
  }
  const related = new Map<string, { k: string; s: number }[]>();
  for (const [x, row] of co) {
    const best = [...row].filter(([, c]) => c >= 3)
      .map(([y, c]) => ({ k: y, s: c / Math.sqrt((df.get(x) ?? 1) * (df.get(y) ?? 1)) }))
      .filter((r) => r.s >= 0.15).sort((a, b) => b.s - a.s).slice(0, 5);
    if (best.length) related.set(x, best);
  }
  const themeLabel = new Map<string, string>();
  for (const m of raw) for (const [k, f] of m) if (f.kind === "thema" && !themeLabel.has(k)) themeLabel.set(k, f.label.replace(/^Thema: /, ""));

  lap.verwandt = Date.now() - T0;
  const keyIds = new Map<string, number>();
  const idOf = (k: string) => { let x = keyIds.get(k); if (x == null) keyIds.set(k, (x = keyIds.size)); return x; };
  const substantive: number[] = [];
  const capped: number[] = [];
  // 3) Gewichtete Merkmals-Vektoren (Art × Seltenheit × Rolle), plus verwandte Themen schwach
  const vecs: Vec[] = raw.map((m) => {
    const acc = new Map<string, number>();
    const labels = new Map<string, string>();
    for (const [k, f] of m) {
      const w = W[f.kind]! * f.f * idf(k);
      if (w > 0) { acc.set(k, (acc.get(k) ?? 0) + w); labels.set(k, f.label); }
    }
    for (const [k, f] of m) {
      if (f.kind !== "thema") continue;
      for (const r of related.get(k) ?? []) {
        if (m.has(r.k)) continue;
        const w = RELATED * r.s * W.thema! * idf(r.k);
        acc.set(r.k, Math.max(acc.get(r.k) ?? 0, w));
        if (!labels.has(r.k)) labels.set(r.k, `verwandtes Thema: ${themeLabel.get(r.k) ?? r.k}`);
      }
    }
    const keys = [...acc.keys()];
    const w = Float64Array.from(keys.map((k) => acc.get(k)!));
    let n = 0; for (const x of w) n += x * x;
    // gleiche Merkmale als sortierte Nummern → schneller Vergleich zweier Filme
    const order = keys.map((k, j) => ({ id: idOf(k), w: w[j] })).sort((a, b) => a.id - b.id);
    for (const k of keys) if (substantive[idOf(k)] === undefined) {
      substantive[idOf(k)] = SUBSTANCE.some((p) => k.startsWith(p)) ? 1 : 0;
      // Personen und Reihen: höchstens 4 Verbindungen über dieselbe Person – Themen dürfen viele Filme teilen
      capped[idOf(k)] = PEOPLE.some((p) => k.startsWith(p)) ? 1 : 0;
    }
    return { keys, w, norm: Math.sqrt(n), labels, ids: Int32Array.from(order, (o) => o.id), iw: Float64Array.from(order, (o) => o.w) };
  });

  // 4) Index: Merkmal → Filme (ohne Einzelstücke und sehr häufige Merkmale)
  const post = new Map<string, { i: number; w: number }[]>();
  vecs.forEach((v, i) => v.keys.forEach((k, j) => {
    if (!raw[i].has(k)) return; // verwandte Themen nicht in den Index (sonst wird es sehr langsam)
    const d = df.get(k) ?? 0;
    if (d < 2 || d > MAX_DF) return;
    const l = post.get(k); if (l) l.push({ i, w: v.w[j] }); else post.set(k, [{ i, w: v.w[j] }]);
  }));

  lap.vektoren = Date.now() - T0;
  // 5) Für jeden Film die ähnlichsten finden – vielfältig: je Hauptgrund höchstens 3
  const acc = new Float64Array(N);
  const touched: number[] = [];
  const edgeMap = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const v = vecs[i];
    if (!v.norm) continue;
    v.keys.forEach((k, j) => {
      for (const p of post.get(k) ?? []) {
        if (p.i === i) continue;
        if (acc[p.i] === 0) touched.push(p.i);
        acc[p.i] += v.w[j] * p.w;
      }
    });
    // die 80 vielversprechendsten (schnell: Schwelle über sortierte Zahlen statt alle Filme zu sortieren)
    let cand = touched;
    if (touched.length > 80) {
      const vals = Float64Array.from(touched, (c) => acc[c]).sort();
      const thr = vals[vals.length - 80];
      // erst alle klar darüber, dann Gleichstände auffüllen (sonst fliegen bei vielen Gleichständen die Besten raus)
      cand = touched.filter((c) => acc[c] > thr);
      for (const c of touched) { if (cand.length >= 80) break; if (acc[c] === thr) cand.push(c); }
    }
    const scored = cand.map((c) => {
      // Skalarprodukt über zwei sortierte Listen (Reißverschluss)
      const o = vecs[c];
      let dot = 0, sub = 0, lead = -1, leadV = 0, p = 0, q = 0;
      while (p < v.ids.length && q < o.ids.length) {
        const a = v.ids[p], b = o.ids[q];
        if (a === b) {
          const x = v.iw[p] * o.iw[q]; dot += x;
          if (substantive[a]) sub += x;
          if (x > leadV) { leadV = x; lead = a; }
          p++; q++;
        } else if (a < b) p++; else q++;
      }
      return { c, s: dot / (v.norm * o.norm || 1), lead, sub: dot ? sub / dot : 0 };
    }).filter((x) => x.s >= MIN_SIM && x.sub >= SUBSTANCE_MIN).sort((a, b) => b.s - a.s);
    const perLead = new Map<number, number>();
    let taken = 0;
    for (const x of scored) {
      if (taken >= K) break;
      const n = perLead.get(x.lead) ?? 0;
      if (capped[x.lead] && n >= SAME_REASON_MAX) continue;
      perLead.set(x.lead, n + 1);
      const key = i < x.c ? `${i}-${x.c}` : `${x.c}-${i}`;
      edgeMap.set(key, Math.max(edgeMap.get(key) ?? 0, x.s));
      taken++;
    }
    for (const t of touched) acc[t] = 0;
    touched.length = 0;
  }

  lap.nachbarn = Date.now() - T0;
  if (process.env.NET_DEBUG) console.log("Filmnetz Zeiten (ms, kumuliert)", lap);
  const genres = NET_GENRES;
  const nodes: NetNode[] = titles.map((t) => {
    const g = genres.indexOf((t.genres ?? [])[0] ?? "");
    return { id: t.id, t: t.title, y: t.release_year ?? null, g: g < 0 ? genres.length : g, p: t.poster_path ?? null };
  });
  const edges: number[] = [];
  for (const [k, s] of edgeMap) { const [a, b] = k.split("-").map(Number); edges.push(a, b, Math.round(s * 1000)); }
  return { nodes, edges, genres, vecs, byId: new Map(titles.map((t, i) => [t.id, i])), titles };
}

// Warum sind zwei Filme verbunden? Die gemeinsamen Merkmale, stärkste zuerst
export function sharedFeatures(net: Net, a: number, b: number, max = 5): string[] {
  const va = net.vecs[a], vb = net.vecs[b];
  const wb = new Map(vb.keys.map((k, j) => [k, vb.w[j]]));
  let mix = 0;
  return va.keys.map((k, j) => ({ k, s: va.w[j] * (wb.get(k) ?? 0) }))
    .filter((x) => x.s > 0).sort((x, y) => y.s - x.s)
    .filter((x) => !x.k.startsWith("genrepaar:") || mix++ < 1).slice(0, max)
    .map((x) => {
      // direkt bei beiden vorhanden → normales Label, sonst als verwandtes Thema
      const la = va.labels.get(x.k)!, lb = vb.labels.get(x.k)!;
      const ra = la.startsWith("verwandtes"), rb = lb.startsWith("verwandtes");
      return ra && rb ? la : ra ? `≈ ${lb}` : rb ? `≈ ${la}` : la; // ≈ = verwandtes Thema
    });
}

// Für die Vorschläge: Nachbarn je Film-ID (mit Ähnlichkeit), aus dem zwischengespeicherten Netz
const nbCache = new WeakMap<Net, Map<number, { id: number; s: number }[]>>();
export function netNeighbors(catalog: Title[]): Map<number, { id: number; s: number }[]> {
  const net = buildNet(catalog);
  const hit = nbCache.get(net);
  if (hit) return hit;
  const m = new Map<number, { id: number; s: number }[]>();
  const push = (a: number, b: number, s: number) => { const l = m.get(a); if (l) l.push({ id: b, s }); else m.set(a, [{ id: b, s }]); };
  for (let k = 0; k < net.edges.length; k += 3) {
    const a = net.nodes[net.edges[k]].id, b = net.nodes[net.edges[k + 1]].id, s = net.edges[k + 2] / 1000;
    push(a, b, s); push(b, a, s);
  }
  nbCache.set(net, m);
  return m;
}
