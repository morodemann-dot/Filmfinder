"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Poster from "@/components/Poster";
import { netDetails, type NetDetails } from "@/app/net-actions";
import type { NetNode } from "@/lib/filmNet";

// Farben je Hauptgenre (letzte = sonstige)
const COLORS = ["#ff6b35", "#f7b32b", "#ff9ff3", "#ffd93d", "#5d8bf4", "#a0a0a0", "#c084fc", "#6ee7b7",
  "#b388ff", "#d4a373", "#ef4444", "#f472b6", "#818cf8", "#fb7185", "#22d3ee", "#94a3b8", "#84cc16", "#e9a15b", "#8b8b8b"];

type View = { x: number; y: number; k: number };

// Schnell & flüssig:
// - Die Anordnung (Physik) rechnet ein Hintergrund-Prozess (Web Worker) – die Seite bleibt bedienbar.
// - Gezeichnet wird nur, was gerade sichtbar ist.
// - Beim Verschieben/Zoomen wird vereinfacht gezeichnet, in voller Schärfe erst, wenn der Finger ruht.
export default function FilmNet({ nodes, edges, genres }: { nodes: NetNode[]; edges: number[]; genres: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const pos = useRef<Float32Array>(new Float32Array(nodes.length * 2));
  const view = useRef<View>({ x: 0, y: 0, k: 0.3 });
  const dirty = useRef(true);
  const busyUntil = useRef(0); // bis wann "in Bewegung" (vereinfacht zeichnen)
  const [selected, setSelected] = useState<number | null>(null);
  const [details, setDetails] = useState<NetDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyGenre, setOnlyGenre] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [full, setFull] = useState(false);
  const [settled, setSettled] = useState(false);
  const sel = useRef<{ i: number | null; g: number | null; near: Set<number> }>({ i: null, g: null, near: new Set() });
  const layoutDone = useRef(false);

  const adj = useMemo(() => {
    const a: { j: number; s: number }[][] = nodes.map(() => []);
    for (let k = 0; k < edges.length; k += 3) {
      a[edges[k]].push({ j: edges[k + 1], s: edges[k + 2] / 1000 });
      a[edges[k + 1]].push({ j: edges[k], s: edges[k + 2] / 1000 });
    }
    return a;
  }, [nodes, edges]);
  const radius = useMemo(() => Float32Array.from(adj, (a) => 1.6 + Math.sqrt(a.length) * 0.8), [adj]);
  const counts = useMemo(() => {
    const c = new Array(genres.length + 1).fill(0);
    for (const n of nodes) c[n.g]++;
    return c;
  }, [nodes, genres]);

  // Anordnung im Hintergrund berechnen lassen
  useEffect(() => {
    const G = genres.length + 1;
    const p = new Float32Array(nodes.length * 2);
    nodes.forEach((n, i) => {
      const a = (n.g / G) * Math.PI * 2 + (Math.random() - 0.5) * 0.6; // Start: Genres als Tortenstücke
      const r = 250 + Math.random() * 450;
      p[i * 2] = Math.cos(a) * r; p[i * 2 + 1] = Math.sin(a) * r;
    });
    pos.current = p.slice();
    dirty.current = true;
    const worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ pos: Float32Array; done: boolean }>) => {
      pos.current = e.data.pos;
      dirty.current = true;
      if (e.data.done) { layoutDone.current = true; setSettled(true); worker.terminate(); }
    };
    worker.postMessage({ pos: p, edges: Int32Array.from(edges) }, [p.buffer]);
    return () => worker.terminate();
  }, [nodes, edges, genres]);

  // Zeichnen
  useEffect(() => {
    let raf = 0, lastFull = false;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current, b = box.current;
      if (!c || !b) return;
      const moving = performance.now() < busyUntil.current || !layoutDone.current;
      // nach der Bewegung einmal in voller Schärfe nachzeichnen
      if (!moving && !lastFull) dirty.current = true;
      if (!dirty.current) return;
      dirty.current = false;
      lastFull = !moving;

      const dpr = moving ? 1 : Math.min(2, window.devicePixelRatio || 1);
      const W = b.clientWidth, H = b.clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const ctx = c.getContext("2d")!;
      const css = getComputedStyle(document.documentElement);
      const light = document.documentElement.dataset.theme === "light";
      const { x: vx, y: vy, k } = view.current;
      const P = pos.current;
      const { i: si, g: sg, near } = sel.current;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = css.getPropertyValue("--bg").trim() || "#000";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (W / 2 + vx), dpr * (H / 2 + vy));

      // sichtbarer Ausschnitt in Netz-Koordinaten (+ Rand)
      const pad = 30 / k;
      const x0 = (-W / 2 - vx) / k - pad, x1 = (W / 2 - vx) / k + pad, y0 = (-H / 2 - vy) / k - pad, y1 = (H / 2 - vy) / k + pad;
      const inView = (i: number) => { const x = P[i * 2], y = P[i * 2 + 1]; return x > x0 && x < x1 && y > y0 && y < y1; };

      // Verbindungen: beim Bewegen in der Gesamtansicht weglassen (spart am meisten), sonst nur sichtbare
      const drawEdges = !moving || k > 0.9 || edges.length / 3 < 8000;
      if (drawEdges) {
        ctx.lineWidth = 0.6 / k;
        ctx.strokeStyle = si != null ? (light ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.03)") : (light ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.07)");
        ctx.beginPath();
        for (let e = 0; e < edges.length; e += 3) {
          const a = edges[e], b2 = edges[e + 1];
          if (sg != null && nodes[a].g !== sg && nodes[b2].g !== sg) continue;
          if (!inView(a) && !inView(b2)) continue;
          ctx.moveTo(P[a * 2], P[a * 2 + 1]); ctx.lineTo(P[b2 * 2], P[b2 * 2 + 1]);
        }
        ctx.stroke();
      }
      if (si != null) {
        ctx.lineWidth = 1 / k;
        ctx.strokeStyle = light ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.22)";
        ctx.beginPath();
        for (const n of adj[si]) for (const m of adj[n.j]) if (near.has(m.j) && m.j !== si) {
          ctx.moveTo(P[n.j * 2], P[n.j * 2 + 1]); ctx.lineTo(P[m.j * 2], P[m.j * 2 + 1]);
        }
        ctx.stroke();
        ctx.strokeStyle = COLORS[nodes[si].g] ?? "#fff";
        for (const n of adj[si]) {
          ctx.lineWidth = (1 + n.s * 4) / k;
          ctx.globalAlpha = 0.5 + n.s;
          ctx.beginPath(); ctx.moveTo(P[si * 2], P[si * 2 + 1]); ctx.lineTo(P[n.j * 2], P[n.j * 2 + 1]); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Filme (Punkte), nach Farbe gebündelt, nur sichtbare
      const rk = 1 / Math.max(0.6, Math.sqrt(k));
      for (let g = 0; g < COLORS.length; g++) {
        ctx.fillStyle = COLORS[g];
        ctx.globalAlpha = (sg != null && g !== sg) || si != null ? 0.15 : 0.9;
        ctx.beginPath();
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].g !== g || !inView(i)) continue;
          const r = radius[i] * rk, x = P[i * 2], y = P[i * 2 + 1];
          if (moving) ctx.rect(x - r, y - r, r * 2, r * 2); // beim Bewegen: Quadrate (schneller)
          else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (si != null) {
        for (const j of near) {
          const r = radius[j] * rk * (j === si ? 2.6 : 1.6);
          ctx.fillStyle = COLORS[nodes[j].g]; ctx.beginPath(); ctx.arc(P[j * 2], P[j * 2 + 1], r, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = 1.5 / k; ctx.strokeStyle = light ? "#000" : "#fff"; ctx.stroke();
        }
      }

      // Namen
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = "center";
      const text = (i: number, bold: boolean) => {
        const sx = W / 2 + vx + P[i * 2] * k, sy = H / 2 + vy + P[i * 2 + 1] * k;
        if (sx < -50 || sx > W + 50 || sy < -20 || sy > H + 20) return;
        const t = nodes[i].t.length > 26 ? nodes[i].t.slice(0, 25) + "…" : nodes[i].t;
        const ty = sy - radius[i] * rk * k - 5;
        ctx.font = `${bold ? 700 : 500} ${bold ? 13 : 11}px -apple-system, system-ui, sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = light ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)";
        ctx.strokeText(t, sx, ty);
        ctx.fillStyle = light ? "#111" : "#fff";
        ctx.fillText(t, sx, ty);
      };
      if (si != null) { for (const j of near) if (j !== si) text(j, false); text(si, true); }
      else if (k > 1.6 && !moving) {
        let shown = 0;
        for (let i = 0; i < nodes.length && shown < 120; i++) {
          if ((sg != null && nodes[i].g !== sg) || !inView(i) || adj[i].length < (k > 3 ? 1 : 5)) continue;
          text(i, false); shown++;
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges, adj, radius]);

  useEffect(() => {
    const near = new Set<number>();
    if (selected != null) { near.add(selected); for (const n of adj[selected]) near.add(n.j); }
    sel.current = { i: selected, g: onlyGenre, near };
    dirty.current = true;
  }, [selected, onlyGenre, adj]);
  useEffect(() => { dirty.current = true; }, [full]);

  const bump = (ms = 160) => { busyUntil.current = performance.now() + ms; dirty.current = true; };

  // Kamera sanft zu einem Film fahren
  function focus(i: number, zoom = Math.max(view.current.k, 1.8)) {
    const from = { ...view.current };
    const to = { x: -pos.current[i * 2] * zoom, y: -pos.current[i * 2 + 1] * zoom + 60, k: zoom };
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - p, 3);
      view.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
      bump();
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
  const selectRef = useRef(select);
  useEffect(() => { selectRef.current = select; });

  // Bedienung: ziehen = verschieben, zwei Finger / Mausrad = zoomen, tippen = Film wählen
  useEffect(() => {
    const c = canvas.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch: { d: number; k: number; mx: number; my: number } | null = null;
    const rect = () => c.getBoundingClientRect();
    const zoomAt = (sx: number, sy: number, k2: number) => {
      const r = rect(), v = view.current;
      const nk = Math.max(0.08, Math.min(8, k2));
      const cx = sx - r.width / 2, cy = sy - r.height / 2;
      view.current = { k: nk, x: cx - ((cx - v.x) / v.k) * nk, y: cy - ((cy - v.y) / v.k) * nk };
      bump();
    };
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], r = rect();
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.current.k, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
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
        bump();
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0 && moved < 8) {
        // nächster Punkt in Fingernähe
        const r = rect(), v = view.current, P = pos.current;
        const wx = (e.clientX - r.left - r.width / 2 - v.x) / v.k, wy = (e.clientY - r.top - r.height / 2 - v.y) / v.k;
        let best = -1, bd = (16 / v.k) ** 2;
        for (let i = 0; i < nodes.length; i++) {
          const d = (P[i * 2] - wx) ** 2 + (P[i * 2 + 1] - wy) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        selectRef.current(best >= 0 ? best : null, true);
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
  }, [nodes]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.t.toLowerCase().includes(s)).slice(0, 8);
  }, [q, nodes]);
  const indexOf = useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes]);

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
                const j = indexOf.get(n.id) ?? -1;
                return (
                  <li key={n.id}>
                    <button onClick={() => j >= 0 && select(j)}>
                      <span className="net-mini"><Poster path={n.poster_path} title={n.title} size="w185" /></span>
                      <span className="net-item">
                        <span className="net-item-top"><strong>{n.title}</strong><span className="caption">{n.year ?? ""}</span></span>
                        <span className="net-bar"><span style={{ width: `${Math.min(100, n.sim * 100 * 2)}%`, background: j >= 0 ? color(j) : "var(--accent)" }} /></span>
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
