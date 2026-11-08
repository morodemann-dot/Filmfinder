// Filmnetz: verbindet Filme über ihre MERKMALE (Genre, feines Genre, Themen, Regie, Besetzung, Drehbuch,
// Kamera, Musik, Reihe, Vorlage, Jahrzehnt, Land, Sprache, Studio …) – bewusst OHNE TMDB-Empfehlungen.
// Jeder Film bekommt seine stärksten Verbindungen (höchstens K), nicht jeder ist mit jedem verbunden.
import { featuresOf, KIND_NAMES, type FeatureKind } from "./recommend";
import { KW_DE } from "./aspects";
import type { Title } from "./types";

// Wie stark eine gemeinsame Merkmalsart verbindet (wird zusätzlich mit der Seltenheit multipliziert)
const NET_WEIGHT: Partial<Record<FeatureKind, number>> = {
  reihe: 2.5, regie: 2, drehbuch: 1.3, subgenre: 1.2, thema: 1, besetzung: 1, musik: 1, kamera: 0.8,
  genrepaar: 0.8, genre: 0.6, vorlage: 0.6, sprache: 0.4, studio: 0.4, stil: 0.4, jahrzehnt: 0.35, land: 0.3, budget: 0.2,
};
const K = 6; // höchstens so viele Verbindungen sucht sich jeder Film
const MIN_SIM = 0.1; // schwächere Ähnlichkeit = keine Verbindung
const MAX_DF = 400; // sehr häufige Merkmale (z. B. "Drama") nur beim genauen Nachrechnen berücksichtigen

export const NET_GENRES = ["Action", "Abenteuer", "Animation", "Komödie", "Krimi", "Dokumentarfilm", "Drama", "Familie",
  "Fantasy", "Historie", "Horror", "Musik", "Mystery", "Liebesfilm", "Science Fiction", "Thriller", "Kriegsfilm", "Western"];

export type NetNode = { id: number; t: string; y: number | null; g: number; p: string | null };
export type NetData = { nodes: NetNode[]; edges: number[]; genres: string[] }; // edges: [i, j, Ähnlichkeit×1000, …]
type Vec = { keys: string[]; w: Float64Array; norm: number; labels: Map<string, string> };
export type Net = NetData & { vecs: Vec[]; byId: Map<number, number>; titles: Title[] };

const label = (key: string, kind: FeatureKind, raw: string) => {
  const name = kind === "thema" && KW_DE[raw.toLowerCase()] ? KW_DE[raw.toLowerCase()] : raw;
  const short: Partial<Record<FeatureKind, string>> = { thema: "Thema", subgenre: "Genre", genre: "Genre", genrepaar: "Genre-Mix", reihe: "Reihe" };
  return `${short[kind] ?? KIND_NAMES[kind] ?? kind}: ${name}`;
};

const cache = new WeakMap<Title[], Net>();
export function buildNet(catalog: Title[]): Net {
  const hit = cache.get(catalog);
  if (hit) return hit;
  const titles = catalog.filter((t) => t.media_type === "movie" || !t.media_type);
  const N = titles.length;

  // 1) Merkmale je Film und wie viele Filme jedes Merkmal haben
  const raw = titles.map((t) => {
    const m = new Map<string, { kind: FeatureKind; label: string }>();
    for (const f of featuresOf(t)) if (NET_WEIGHT[f.kind]) m.set(f.key, { kind: f.kind, label: label(f.key, f.kind, f.label) });
    return m;
  });
  const df = new Map<string, number>();
  for (const m of raw) for (const k of m.keys()) df.set(k, (df.get(k) ?? 0) + 1);

  // 2) Gewichte: Merkmalsart × Seltenheit (ein seltenes Thema verbindet stärker als "Drama")
  const vecs: Vec[] = raw.map((m) => {
    const keys: string[] = [], ws: number[] = [], labels = new Map<string, string>();
    for (const [k, f] of m) {
      const idf = Math.log(N / (df.get(k) ?? 1));
      const w = NET_WEIGHT[f.kind]! * idf;
      if (w <= 0) continue;
      keys.push(k); ws.push(w); labels.set(k, f.label);
    }
    const w = Float64Array.from(ws);
    let n = 0; for (const x of w) n += x * x;
    return { keys, w, norm: Math.sqrt(n), labels };
  });

  // 3) Index: Merkmal → Filme (ohne Einzelstücke und sehr häufige Merkmale)
  const post = new Map<string, { i: number; w: number }[]>();
  vecs.forEach((v, i) => v.keys.forEach((k, j) => {
    const d = df.get(k) ?? 0;
    if (d < 2 || d > MAX_DF) return;
    const l = post.get(k); if (l) l.push({ i, w: v.w[j] }); else post.set(k, [{ i, w: v.w[j] }]);
  }));

  // 4) Für jeden Film die ähnlichsten finden: grob über den Index, dann genau nachrechnen
  const acc = new Float64Array(N);
  const touched: number[] = [];
  const edgeMap = new Map<string, number>();
  const pos = vecs.map((v) => new Map(v.keys.map((k, j) => [k, v.w[j]])));
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
    const cand = touched.sort((a, b) => acc[b] - acc[a]).slice(0, 40);
    const scored = cand.map((c) => {
      let dot = 0;
      const other = pos[c];
      v.keys.forEach((k, j) => { const x = other.get(k); if (x) dot += v.w[j] * x; });
      return { c, s: dot / (v.norm * vecs[c].norm || 1) };
    }).filter((x) => x.s >= MIN_SIM).sort((a, b) => b.s - a.s).slice(0, K);
    for (const { c, s } of scored) {
      const key = i < c ? `${i}-${c}` : `${c}-${i}`;
      edgeMap.set(key, Math.max(edgeMap.get(key) ?? 0, s));
    }
    for (const t of touched) acc[t] = 0;
    touched.length = 0;
  }

  const genres = NET_GENRES;
  const nodes: NetNode[] = titles.map((t) => {
    const g = genres.indexOf((t.genres ?? [])[0] ?? "");
    return { id: t.id, t: t.title, y: t.release_year ?? null, g: g < 0 ? genres.length : g, p: t.poster_path ?? null };
  });
  const edges: number[] = [];
  for (const [k, s] of edgeMap) { const [a, b] = k.split("-").map(Number); edges.push(a, b, Math.round(s * 1000)); }
  const net: Net = { nodes, edges, genres, vecs, byId: new Map(titles.map((t, i) => [t.id, i])), titles };
  cache.set(catalog, net);
  return net;
}

// Warum sind zwei Filme verbunden? Die gemeinsamen Merkmale, stärkste zuerst
export function sharedFeatures(net: Net, a: number, b: number, max = 4): string[] {
  const va = net.vecs[a], vb = net.vecs[b];
  const wb = new Map(vb.keys.map((k, j) => [k, vb.w[j]]));
  return va.keys.map((k, j) => ({ k, s: va.w[j] * (wb.get(k) ?? 0) }))
    .filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, max).map((x) => va.labels.get(x.k)!);
}
