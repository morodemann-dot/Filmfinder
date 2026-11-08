// "Verbindet deine Lieblingsfilme": Filme, die im Filmnetz gleichzeitig neben zwei (oder mehr)
// deiner Lieblings- bzw. Top-Filme liegen. Besonders spannend, wenn die beiden Lieblinge selbst
// wenig miteinander zu tun haben – dann trifft der Film eine Gemeinsamkeit, die du sonst nicht siehst.
import { netNeighbors } from "./filmNet";
import type { RatedTitle } from "./recommend";
import type { Title } from "./types";

export type Bridge = { t: Title; a: RatedTitle; b: RatedTitle; more: number; score: number };

export function findBridges(catalog: Title[], rated: RatedTitle[], allowed: Set<number>, taste: Map<number, number>, max = 15): Bridge[] {
  const nb = netNeighbors(catalog);
  // Anker: Lieblingsfilme und 8–10er
  const weight = (r: RatedTitle) => (r.favorite ? 1.5 : r.status === "gesehen" && (r.rating ?? 0) >= 9 ? 1.2 : r.status === "gesehen" && (r.rating ?? 0) >= 8 ? 0.9 : 0);
  const anchors = rated.filter((r) => weight(r) > 0);
  const linked = (x: number, y: number) => (nb.get(x) ?? []).some((n) => n.id === y);
  // Kandidat → welche Anker liegen direkt daneben (und wie nah)
  const hits = new Map<number, { r: RatedTitle; v: number }[]>();
  for (const a of anchors) {
    for (const n of nb.get(a.id) ?? []) {
      if (!allowed.has(n.id)) continue;
      const l = hits.get(n.id) ?? [];
      l.push({ r: a, v: weight(a) * n.s });
      hits.set(n.id, l);
    }
  }
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const out: Bridge[] = [];
  for (const [id, l] of hits) {
    if (l.length < 2) continue;
    l.sort((x, y) => y.v - x.v);
    // bestes Paar: stark verbunden – Bonus, wenn die beiden Lieblinge untereinander NICHT verbunden sind
    let best: { a: RatedTitle; b: RatedTitle; s: number } | null = null;
    for (let i = 0; i < Math.min(l.length, 6); i++) for (let j = i + 1; j < Math.min(l.length, 6); j++) {
      const s = (l[i].v + l[j].v) * (linked(l[i].r.id, l[j].r.id) ? 1 : 1.25);
      if (!best || s > best.s) best = { a: l[i].r, b: l[j].r, s };
    }
    const t = byId.get(id);
    if (!t || !best) continue;
    const extra = l.slice(2).reduce((s, x) => s + x.v, 0) * 0.5;
    out.push({ t, a: best.a, b: best.b, more: l.length - 2, score: best.s + extra + 0.4 * (taste.get(id) ?? 0) });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, max);
}
