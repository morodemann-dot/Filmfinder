// Hintergrund-Prozess: berechnet die Anordnung des Filmnetzes, ohne die Bedienung zu blockieren.
// Schickt laufend die aktuellen Positionen an die Seite (als Zahlenliste x0,y0,x1,y1,…).
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";

type N = SimulationNodeDatum & { i: number };
type L = SimulationLinkDatum<N> & { s: number };

self.onmessage = (e: MessageEvent<{ pos: Float32Array; edges: Int32Array }>) => {
  const { pos, edges } = e.data;
  const n = pos.length / 2;
  const nodes: N[] = Array.from({ length: n }, (_, i) => ({ i, x: pos[i * 2], y: pos[i * 2 + 1] }));
  const links: L[] = [];
  for (let k = 0; k < edges.length; k += 3) links.push({ source: edges[k], target: edges[k + 1], s: edges[k + 2] / 1000 });
  const sim = forceSimulation<N, L>(nodes)
    .force("link", forceLink<N, L>(links).id((d) => d.i).distance((l) => 14 + (1 - l.s) * 45).strength((l) => 0.2 + l.s * 0.9))
    .force("charge", forceManyBody<N>().strength(-12).theta(1.1).distanceMax(180))
    .force("x", forceX<N>(0).strength(0.03))
    .force("y", forceY<N>(0).strength(0.03))
    .alphaDecay(0.025)
    .velocityDecay(0.4)
    .stop();
  let last = 0;
  const send = (done: boolean) => {
    const out = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { out[i * 2] = nodes[i].x!; out[i * 2 + 1] = nodes[i].y!; }
    (self as unknown as Worker).postMessage({ pos: out, done }, [out.buffer]);
  };
  const run = () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 40 && sim.alpha() > sim.alphaMin()) sim.tick();
    const done = sim.alpha() <= sim.alphaMin();
    if (done || performance.now() - last > 60) { send(done); last = performance.now(); }
    if (!done) setTimeout(run, 0);
  };
  run();
};
