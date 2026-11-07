import { Fragment } from "react";
import Link from "next/link";
import { evaluate, kindImpacts, MIN_FOR_TEST, tuneOptions } from "@/lib/evaluate";
import { KIND_NAMES, type FeatureKind, type RatedTitle } from "@/lib/recommend";

// Messtest: Wie treffsicher sind die Vorschläge – und welche Merkmale helfen wirklich?

const pct = (x: number) => `${Math.round(x * 100)}\u00a0%`;
const pp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}`;

function Row({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  // Balken von 50 % (Raten) bis 100 % (perfekt)
  const w = Math.max(0, Math.min(100, ((value - 0.5) / 0.5) * 100));
  return (
    <div className="cov">
      <div className="cov-head">
        <span style={{ fontWeight: strong ? 600 : undefined }}>{label}</span>
        <span className="caption">{pct(value)}</span>
      </div>
      <div className="progress"><div style={{ width: `${w}%`, background: strong ? "var(--accent)" : "var(--ok)" }} /></div>
      {hint && <div className="caption" style={{ marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

export type Variant = { name: string; covered: number; rated: RatedTitle[] };

export default function MesstestView({ rated, variants = [] }: { rated: RatedTitle[]; variants?: Variant[] }) {
  const count = rated.filter((r) => r.status === "gesehen" && r.rating).length;

  if (count < MIN_FOR_TEST) {
    return (
      <>
        <h1>Messtest</h1>
        <div className="empty">
          <p>Für einen aussagekräftigen Test braucht es mindestens <strong>{MIN_FOR_TEST} bewertete Filme</strong> (bisher: {count}).</p>
          <Link href="/bewerten" className="btn primary">Weiter bewerten</Link>
        </div>
      </>
    );
  }

  const tuned = tuneOptions(rated);
  const full = tuned.result!;
  const qualityOnly = evaluate(rated, { ...tuned.opts, tasteWeight: 0 });
  const tasteOnly = evaluate(rated, { ...tuned.opts, qualityWeight: 0, tasteWeight: tuned.opts.tasteWeight || 1 });
  // Stufe 2: dieselbe Messung mit KI-Merkmalen je Modell
  const aiResults = variants.map((v) => {
    const t = tuneOptions(v.rated);
    return { ...v, tuned: t, taste: evaluate(v.rated, { ...t.opts, qualityWeight: 0, tasteWeight: t.opts.tasteWeight || 1 }) };
  });
  const bestAi = aiResults.reduce<(typeof aiResults)[number] | null>((a, b) => (!a || b.tuned.result!.accuracy > a.tuned.result!.accuracy ? b : a), null);
  // Welche Merkmale tragen? (bei vorhandenen KI-Merkmalen mit dem besten Modell; mit Geschmacks-Anteil mind. 1 messen)
  // Je Modell eine Spalte (ohne KI-Daten: eine Spalte "Ohne KI")
  const columns = (aiResults.length ? aiResults : [{ name: "Ohne KI", rated, tuned }]).map((v) => {
    const probe = { ...v.tuned.opts, tasteWeight: v.tuned.opts.tasteWeight || 1 };
    const list = kindImpacts(v.rated, Object.keys(KIND_NAMES) as FeatureKind[], evaluate(v.rated, probe), probe);
    return { name: v.name, delta: new Map(list.map((x) => [x.kind, x.delta])) };
  });
  const kinds = (Object.keys(KIND_NAMES) as FeatureKind[])
    .map((kind) => ({ kind, max: Math.max(...columns.map((c) => c.delta.get(kind) ?? 0)), any: columns.some((c) => (c.delta.get(kind) ?? 0) !== 0) }))
    .sort((a, b) => b.max - a.max);
  // Unterschiede unter ca. 0,5 Punkten sind bei wenigen Bewertungen Zufall
  const noise = count < 60 ? 0.01 : 0.005;

  return (
    <>
      <h1>Messtest</h1>
      <p className="caption" style={{ marginTop: -4 }}>
        Die App versteckt nacheinander je ein Fünftel deiner {count} Bewertungen, lernt aus dem Rest und sagt bei
        Filmpaaren voraus, welcher dir besser gefällt. Dann wird mit deinen echten Punkten verglichen.
        50 % wäre reines Raten, 100 % perfekt.
      </p>

      <div className="panel" style={{ marginBottom: 14, textAlign: "center" }}>
        <div className="eyebrow">Treffsicherheit</div>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1, margin: "4px 0" }}>{pct(full.accuracy)}</div>
        <div className="caption">
          Bei {Math.round(full.accuracy * 100)} von 100 Filmpaaren lag die App richtig ({full.pairs.toLocaleString("de-DE")} Paare geprüft).
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Woher kommt die Treffsicherheit?</div>
        <div className="cov-grid">
          <Row label="Nur allgemeine Qualität (TMDB)" value={qualityOnly.accuracy} hint="Was jeder gut findet – so stark gewichtet, wie es zu deinen Punkten passt." />
          <Row label="Nur dein persönlicher Geschmack" value={tasteOnly.accuracy} hint="Was du anders siehst als die allgemeine Meinung." />
          <Row label="Beides zusammen (so arbeitet die App)" value={full.accuracy} strong />
        </div>
        <p className="caption" style={{ marginBottom: 0 }}>
          {tuned.opts.tasteWeight === 0
            ? "Bei deinen bisherigen Bewertungen bringt der persönliche Geschmack noch keinen Gewinn über die allgemeine Qualität hinaus. Die App setzt deshalb gerade vor allem auf Qualität – das ändert sich automatisch, sobald deine Bewertungen ein eigenes Muster zeigen."
            : `Die App hat für dich die treffsicherste Mischung gewählt: Geschmacks-Anteil ${tuned.opts.tasteWeight.toLocaleString("de-DE")}${tuned.opts.shrink > 2 ? ", mit extra Vorsicht bei wenigen Belegen" : ""}. Wird bei jedem Aufruf neu berechnet.`}
        </p>
      </div>

      {aiResults.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Stufe 2 – bringen die KI-Merkmale etwas?</div>
          <p className="caption" style={{ marginTop: 0 }}>
            Dieselbe Messung, einmal ohne und einmal mit den KI-Einschätzungen (Stimmung, Tempo, Komplexität …).
          </p>
          <div className="cov-grid">
            <Row label="Ohne KI-Merkmale" value={full.accuracy} hint={`Nur persönlicher Geschmack: ${pct(tasteOnly.accuracy)}`} />
            {aiResults.map((a) => {
              const gain = a.tuned.result!.accuracy - full.accuracy;
              return (
                <Row key={a.name} label={`Mit KI-Merkmalen (${a.name})`} value={a.tuned.result!.accuracy} strong={a === bestAi && gain > noise}
                  hint={`${pp(gain)} Punkte · nur persönlicher Geschmack: ${pct(a.taste.accuracy)} · ${a.covered} Filme eingeschätzt`} />
              );
            })}
          </div>
          <p className="caption" style={{ marginBottom: 0 }}>
            {bestAi && bestAi.tuned.result!.accuracy - full.accuracy > noise
              ? `Die KI-Merkmale machen die Vorschläge treffsicherer – am meisten mit ${bestAi.name}.`
              : "Bisher kein deutlicher Gewinn durch die KI-Merkmale (Unterschiede unter 0,5 Punkten sind Zufall)."}
          </p>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Welche Merkmale helfen bei dir?</div>
        <p className="caption" style={{ marginTop: 0 }}>
          Wie viele Prozentpunkte die Treffsicherheit sinkt, wenn die App dieses Merkmal <em>nicht</em> kennt – gemessen an dem, was du anders siehst als die allgemeine Meinung.
          <span style={{ color: "var(--ok)" }}>Grün = hilft</span>, <span style={{ color: "var(--danger)" }}>Rot = stört eher</span>,
          grau = kaum Wirkung (unter {pp(noise).slice(1)} ist bei {count} Bewertungen noch Zufall).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: `minmax(0, 1fr) repeat(${columns.length}, 56px)`, gap: "6px 10px", alignItems: "baseline" }}>
          {columns.length > 1 && (
            <>
              <span />
              {columns.map((c) => <span key={c.name} className="eyebrow" style={{ textAlign: "right" }}>{c.name.replace(/ [\d.]+$/, "")}</span>)}
            </>
          )}
          {kinds.filter((k) => k.any).map(({ kind }) => (
            <Fragment key={kind}>
              <span>{KIND_NAMES[kind]}</span>
              {columns.map((c) => {
                const delta = c.delta.get(kind) ?? 0;
                const color = delta > noise ? "var(--ok)" : delta < -noise ? "var(--danger)" : "var(--muted)";
                return <span key={c.name} className="caption" style={{ color, textAlign: "right", whiteSpace: "nowrap" }}>{pp(delta)}</span>;
              })}
            </Fragment>
          ))}
        </div>
        {kinds.some((k) => !k.any) && (
          <p className="caption" style={{ marginBottom: 0 }}>
            Ohne messbare Wirkung (zu wenig Daten oder egal für dich):{" "}
            {kinds.filter((k) => !k.any).map((k) => KIND_NAMES[k.kind]).join(", ")}
          </p>
        )}
        <p className="caption" style={{ marginBottom: 0 }}>
          Gut zu wissen: Ähnliche Merkmale (z. B. Düsternis und Grundstimmung) können sich gegenseitig ersetzen – fällt eines weg,
          springt das andere ein. Einzeln wirken sie dann klein, obwohl sie zusammen viel ausmachen. Entscheidend ist deshalb die
          Gesamtzahl oben bei „Stufe 2“.
        </p>
      </div>

      <p className="caption">
        Je mehr du bewertest – gerade auch Filme, die dir nicht gefallen haben –, desto genauer wird der Test.
        Mit Stufe 2 (Stimmung, Tempo, Komplexität …) kommen neue Merkmale dazu; hier sehen wir dann, ob sie wirklich helfen.
      </p>
      <Link href="/" className="btn">‹ Zurück zum Filmfinder</Link>
    </>
  );
}
