"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  forceLink, forceManyBody, forceSimulation, forceX, forceY,
  type Simulation, type SimulationLinkDatum, type SimulationNodeDatum,
} from "d3-force";
import Poster from "@/components/Poster";
import { netDetails, type NetDetails } from "@/app/net-actions";
import type { NetNode } from "@/lib/filmNet";

// Farben je Hauptgenre (letzte = sonstige)
const COLORS = ["#ff6b35", "#f7b32b", "#ff9ff3", "#ffd93d", "#5d8bf4", "#a0a0a0", "#c084fc", "#6ee7b7",
  "#b388ff", "#d4a373", "#ef4444", "#f472b6", "#818cf8", "#fb7185", "#22d3ee", "#94a3b8", "#84cc16", "#e9a15b", "#8b8b8b"];

type N = SimulationNodeDatum & { i: number; g: number; deg: number };
type L = SimulationLinkDatum<N> & { s: number };
type View = { x: number; y: number; k: number };

export default function FilmNet({ nodes, edges, genres }: { nodes: NetNode[]; edges: number[]; genres: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const sim = useRef<Simulation<N, L> | null>(null);
  const simNodes = useRef<N[]>([]);
  const links = useRef<L[]>([]);
  const view = useRef<View>({ x: 0, y: 0, k: 0.35 });
  const dirty = useRef(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [details, setDetails] = useState<NetDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyGenre, setOnlyGenre] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [full, setFull] = useState(false);
  const [settled, setSettled] = useState(false);
  const sel = useRef<{ i: number | null; g: number | null }>({ i: null, g: null });

  // Nachbarn je Film (für das Hervorheben)
  const adj = useMemo(() => {
    const a: { j: number; s: number }[][] = nodes.map(() => []);
    for (let k = 0; k < edges.length; k += 3) {
      a[edges[k]].push({ j: edges[k + 1], s: edges[k + 2] / 1000 });
      a[edges[k + 1]].push({ j: edges[k], s: edges[k + 2] / 1000 });
    }
    return a;
  }, [nodes, edges]);
  const counts = useMemo(() => {
    const c = new Array(genres.length + 1).fill(0);
    for (const n of nodes) c[n.g]++;
    return c;
  }, [nodes, genres]);

  // Simulation: Filme stoßen sich ab, Verbindungen ziehen sie zusammen → ähnliche Filme bilden Gruppen
  useEffect(() => {
    const G = genres.length + 1;
    const ns: N[] = nodes.map((n, i) => {
      const a = (n.g / G) * Math.PI * 2 + (Math.random() - 0.5) * 0.6; // Start: Genres als Tortenstücke
      const r = 300 + Math.random() * 500;
      return { i, g: n.g, deg: adj[i].length, x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
    const ls: L[] = [];
    for (let k = 0; k < edges.length; k += 3) ls.push({ source: edges[k], target: edges[k + 1], s: edges[k + 2] / 1000 });
    simNodes.current = ns; links.current = ls;
    const s = forceSimulation<N, L>(ns)
      .force("link", forceLink<N, L>(ls).id((d) => d.i).distance((l) => 14 + (1 - l.s) * 45).strength((l) => 0.35 + l.s * 1.2))
      .force("charge", forceManyBody<N>().strength(-12).theta(0.95).distanceMax(180))
      .force("x", forceX<N>(0).strength(0.025))
      .force("y", forceY<N>(0).strength(0.025))
      .alphaDecay(0.018)
      .velocityDecay(0.35)
      .on("tick", () => { dirty.current = true; })
      .on("end", () => setSettled(true));
    sim.current = s;
    return () => { s.stop(); };
  }, [nodes, edges, genres, adj]);

  // Zeichnen (nur wenn sich etwas geändert hat)
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current, b = box.current;
      if (!c || !b) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = b.clientWidth, H = b.clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); dirty.current = true;
      }
      if (!dirty.current) return;
      dirty.current = false;
      const ctx = c.getContext("2d")!;
      const css = getComputedStyle(document.documentElement);
      const light = document.documentElement.dataset.theme === "light";
      const { x: vx, y: vy, k } = view.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = css.getPropertyValue("--bg").trim() || "#000";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (W / 2 + vx), dpr * (H / 2 + vy));

      const ns = simNodes.current, ls = links.current;
      const si = sel.current.i, sg = sel.current.g;
      const near = new Set<number>();
      if (si != null) { near.add(si); for (const n of adj[si]) near.add(n.j); }

      // Verbindungen
      ctx.lineWidth = 0.6 / k;
      ctx.strokeStyle = light ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.07)";
      if (si != null) ctx.strokeStyle = light ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.03)";
      ctx.beginPath();
      for (const l of ls) {
        const a = l.source as N, b2 = l.target as N;
        if (sg != null && a.g !== sg && b2.g !== sg) continue;
        ctx.moveTo(a.x!, a.y!); ctx.lineTo(b2.x!, b2.y!);
      }
      ctx.stroke();
      if (si != null) {
        // Verbindungen der Nachbarn untereinander (2. Kreis) und die direkten Verbindungen
        ctx.lineWidth = 1 / k;
        ctx.strokeStyle = light ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.22)";
        ctx.beginPath();
        for (const n of adj[si]) for (const m of adj[n.j]) if (near.has(m.j) && m.j !== si) {
          ctx.moveTo(ns[n.j].x!, ns[n.j].y!); ctx.lineTo(ns[m.j].x!, ns[m.j].y!);
        }
        ctx.stroke();
        for (const n of adj[si]) {
          ctx.lineWidth = (1 + n.s * 4) / k;
          ctx.strokeStyle = COLORS[ns[si].g] ?? "#fff";
          ctx.globalAlpha = 0.5 + n.s;
          ctx.beginPath(); ctx.moveTo(ns[si].x!, ns[si].y!); ctx.lineTo(ns[n.j].x!, ns[n.j].y!); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Filme (Punkte), nach Farbe gebündelt
      const rOf = (n: N) => (1.6 + Math.sqrt(n.deg) * 0.9) / Math.max(0.6, Math.sqrt(k));
      for (let g = 0; g < COLORS.length; g++) {
        const dim = (sg != null && g !== sg) || si != null;
        ctx.fillStyle = COLORS[g];
        ctx.globalAlpha = dim ? 0.15 : 0.9;
        ctx.beginPath();
        for (const n of ns) {
          if (n.g !== g) continue;
          const r = rOf(n);
          ctx.moveTo(n.x! + r, n.y!); ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (si != null) {
        for (const j of near) {
          const n = ns[j], r = rOf(n) * (j === si ? 2.6 : 1.6);
          ctx.fillStyle = COLORS[n.g]; ctx.beginPath(); ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = 1.5 / k; ctx.strokeStyle = light ? "#000" : "#fff"; ctx.stroke();
        }
      }

      // Namen: beim gewählten Film und seinen Nachbarn – und beim Hineinzoomen
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = "center";
      const toScreen = (n: N) => [W / 2 + vx + n.x! * k, H / 2 + vy + n.y! * k];
      const text = (n: N, bold: boolean) => {
        const [sx, sy] = toScreen(n);
        if (sx < -50 || sx > W + 50 || sy < -20 || sy > H + 20) return;
        const t = nodes[n.i].t.length > 26 ? nodes[n.i].t.slice(0, 25) + "…" : nodes[n.i].t;
        ctx.font = `${bold ? 700 : 500} ${bold ? 13 : 11}px -apple-system, system-ui, sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = light ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)";
        ctx.strokeText(t, sx, sy - rOf(n) * k - 5);
        ctx.fillStyle = light ? "#111" : "#fff";
        ctx.fillText(t, sx, sy - rOf(n) * k - 5);
      };
      if (si != null) { for (const j of near) if (j !== si) text(ns[j], false); text(ns[si], true); }
      else if (k > 1.6) {
        let shown = 0;
        for (const n of ns) {
          if (sg != null && n.g !== sg) continue;
          const [sx, sy] = toScreen(n);
          if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
          if (n.deg < (k > 3 ? 1 : 4)) continue;
          text(n, false);
          if (++shown > 120) break;
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [nodes, adj]);

  useEffect(() => { sel.current = { i: selected, g: onlyGenre }; dirty.current = true; }, [selected, onlyGenre]);
  useEffect(() => { dirty.current = true; }, [full]);

  // Kamera sanft zu einem Film fahren
  function focus(i: number, zoom = 1.6) {
    const n = simNodes.current[i];
    if (!n) return;
    const from = { ...view.current };
    const to = { x: -n.x! * zoom, y: -n.y! * zoom + 60, k: zoom };
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - p, 3);
      view.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
      dirty.current = true;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async function select(i: number | null, move = true) {
    setSelected(i);
    setDetails(null);
    if (i == null) return;
    if (move) focus(i);
    setLoading(true);
    try { setDetails(await netDetails(nodes[i].id)); }
    catch { setDetails(null); }
    finally { setLoading(false); }
  }

  // Bedienung: ziehen = verschieben, zwei Finger / Mausrad = zoomen, tippen = Film wählen
  useEffect(() => {
    const c = canvas.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch: { d: number; k: number; mx: number; my: number; vx: number; vy: number } | null = null;
    const rect = () => c.getBoundingClientRect();
    const zoomAt = (sx: number, sy: number, k2: number) => {
      const r = rect(), v = view.current;
      const nk = Math.max(0.08, Math.min(8, k2));
      const cx = sx - r.width / 2, cy = sy - r.height / 2;
      view.current = { k: nk, x: cx - ((cx - v.x) / v.k) * nk, y: cy - ((cy - v.y) / v.k) * nk };
      dirty.current = true;
    };
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], r = rect();
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.current.k, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, vx: view.current.x, vy: view.current.y };
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        zoomAt(pinch.mx, pinch.my, pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      } else if (pts.size === 1) {
        view.current = { ...view.current, x: view.current.x + dx, y: view.current.y + dy };
        dirty.current = true;
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && moved < 8) {
        const r = rect(), v = view.current;
        const wx = (e.clientX - r.left - r.width / 2 - v.x) / v.k, wy = (e.clientY - r.top - r.height / 2 - v.y) / v.k;
        const hit = sim.current?.find(wx, wy, 14 / v.k);
        select(hit ? hit.i : null, false);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, view.current.k * Math.exp(-e.deltaY * 0.0015));
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", wheel, { passive: false });
    return () => {
      c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up); c.removeEventListener("wheel", wheel);
    };
    // select ist stabil genug (setzt nur State)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.t.toLowerCase().includes(s)).slice(0, 8);
  }, [q, nodes]);

  const color = (i: number) => COLORS[nodes[i].g] ?? "#999";
  return (
    <div className={`net ${full ? "net-full" : ""}`}>
      <div className="net-head">
        <div>
          <h1 className="page-title-compact" style={{ margin: 0 }}>Filmnetz</h1>
          <div className="caption">
            {nodes.length.toLocaleString("de-DE")} Filme · {(edges.length / 3).toLocaleString("de-DE")} Verbindungen über gemeinsame Merkmale
            {!settled && " · ordnet sich …"}
          </div>
        </div>
        <button className="icon-round" aria-label={full ? "Vollbild beenden" : "Vollbild"} onClick={() => setFull((f) => !f)}>{full ? "✕" : "⤢"}</button>
      </div>

      <div className="net-search">
        <input className="input" type="search" placeholder="Film im Netz suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        {hits.length > 0 && (
          <ul className="onb-hits">
            {hits.map(({ n, i }) => (
              <li key={n.id}><button onClick={() => { setQ(""); select(i); }}>
                <span className="net-dot" style={{ background: color(i) }} />
                <span className="onb-hit-text"><strong>{n.t}</strong><span className="caption">{n.y ?? ""}</span></span>
                <span />
              </button></li>
            ))}
          </ul>
        )}
      </div>

      <div className="net-legend">
        {genres.map((g, i) => counts[i] > 0 && (
          <button key={g} className={`net-chip ${onlyGenre === i ? "on" : ""}`} onClick={() => setOnlyGenre((x) => (x === i ? null : i))}>
            <span className="net-dot" style={{ background: COLORS[i] }} />{g}
          </button>
        ))}
      </div>

      <div className="net-canvas" ref={box}>
        <canvas ref={canvas} />
        {selected == null && <div className="net-hint">Ziehen = verschieben · zwei Finger = zoomen · Punkt antippen = Verbindungen</div>}
      </div>

      {selected != null && (
        <div className="net-sheet">
          <div className="net-sheet-head">
            <span className="net-dot big" style={{ background: color(selected) }} />
            <div style={{ minWidth: 0 }}>
              <strong>{nodes[selected].t}</strong>
              <div className="caption">
                {[nodes[selected].y, details?.genres.slice(0, 2).join(", "), details?.directors[0] && `Regie: ${details.directors[0]}`].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Link href={`/titel/${nodes[selected].id}`} className="caption" style={{ whiteSpace: "nowrap" }}>Details ›</Link>
            <button className="linkish" aria-label="Schließen" onClick={() => select(null)}>✕</button>
          </div>
          {loading && <p className="caption">Lade Verbindungen …</p>}
          {details && details.neighbors.length === 0 && <p className="caption">Keine starken Verbindungen – dieser Film ist ein Einzelgänger.</p>}
          {details && (
            <ul className="net-list">
              {details.neighbors.map((n) => {
                const j = nodes.findIndex((x) => x.id === n.id);
                return (
                  <li key={n.id}>
                    <button onClick={() => j >= 0 && select(j)}>
                      <span className="net-mini"><Poster path={n.poster_path} title={n.title} size="w185" /></span>
                      <span className="net-item">
                        <span className="net-item-top"><strong>{n.title}</strong><span className="caption">{n.year ?? ""}</span></span>
                        <span className="net-bar"><span style={{ width: `${Math.min(100, n.sim * 100 * 1.6)}%`, background: j >= 0 ? color(j) : "var(--accent)" }} /></span>
                        <span className="net-why">{n.why.map((w) => <span key={w} className="tag">{w}</span>)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
