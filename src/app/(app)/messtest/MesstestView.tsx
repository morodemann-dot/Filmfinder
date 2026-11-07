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

export default function MesstestView({ rated }: { rated: RatedTitle[] }) {
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
  // Welche Merkmale tragen? (auch wenn der Geschmack gerade abgeschaltet ist, mit Anteil 1 messen)
  const probe = { ...tuned.opts, tasteWeight: tuned.opts.tasteWeight || 1 };
  const impacts = kindImpacts(rated, Object.keys(KIND_NAMES) as FeatureKind[], evaluate(rated, probe), probe);
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

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Welche Merkmale helfen bei dir?</div>
        <p className="caption" style={{ marginTop: 0 }}>
          Wie viele Prozentpunkte die Treffsicherheit sinkt, wenn die App dieses Merkmal <em>nicht</em> kennt – gemessen an dem, was du anders siehst als die allgemeine Meinung.
          Kleine Werte (unter {pp(noise).slice(1)}) sind bei {count} Bewertungen noch Zufall.
        </p>
        <div style={{ display: "grid", gap: 6 }}>
          {impacts.filter((x) => x.delta !== 0).map(({ kind, delta }) => {
            const verdict = delta > noise ? "hilft" : delta < -noise ? "stört eher" : "kaum Wirkung";
            const color = delta > noise ? "var(--ok)" : delta < -noise ? "var(--danger)" : "var(--muted, #8e8e93)";
            return (
              <div key={kind} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                <span>{KIND_NAMES[kind]}</span>
                <span className="caption" style={{ color, whiteSpace: "nowrap" }}>{pp(delta)} · {verdict}</span>
              </div>
            );
          })}
        </div>
        {impacts.some((x) => x.delta === 0) && (
          <p className="caption" style={{ marginBottom: 0 }}>
            Ohne messbare Wirkung (zu wenig Daten oder egal für dich):{" "}
            {impacts.filter((x) => x.delta === 0).map((x) => KIND_NAMES[x.kind]).join(", ")}
          </p>
        )}
      </div>

      <p className="caption">
        Je mehr du bewertest – gerade auch Filme, die dir nicht gefallen haben –, desto genauer wird der Test.
        Mit Stufe 2 (Stimmung, Tempo, Komplexität …) kommen neue Merkmale dazu; hier sehen wir dann, ob sie wirklich helfen.
      </p>
      <Link href="/" className="btn">‹ Zurück zum Filmfinder</Link>
    </>
  );
}
