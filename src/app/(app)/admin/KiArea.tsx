import { Fragment } from "react";
import Link from "next/link";
import AiPilot from "./AiPilot";
import DuelDeck from "./DuelDeck";
import { PrepareButton, ResetButton, RoundButton } from "./DuelControls";
import { aiPilotStatus, type AiStatus } from "@/app/catalog-actions";
import { duelCards, duelResults, type DuelCard } from "@/app/ki-actions";
import { createClient } from "@/lib/supabase/server";
import { loadAiFeatures, loadTasteData } from "@/lib/tasteData";
import { compareModels, type ModelResult } from "@/lib/aiCompare";
import { KIND_NAMES, type FeatureKind } from "@/lib/recommend";
import { AI_SCALES, type AiScale } from "@/lib/aiFeatures";
import { DUEL_MODELS } from "@/lib/duel";

// Reiter "KI": Einschätzungen, Vergleich der Modelle im Messtest und blindes Modell-Duell.

const usd = (x: number) => x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " $";
const pct = (x: number) => `${Math.round(x * 100)} %`;
const pp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}`;

function Delta({ v, noise }: { v: number | undefined; noise: number }) {
  if (v == null) return <span className="caption" style={{ textAlign: "right" }}>–</span>;
  const color = v > noise ? "var(--ok)" : v < -noise ? "var(--danger)" : "var(--muted)";
  return <span className="caption" style={{ color, textAlign: "right", fontWeight: v > noise ? 600 : undefined }}>{pp(v)}</span>;
}

function FeatureTable({ kinds, models, noise, agreement }: {
  kinds: FeatureKind[]; models: ModelResult[]; noise: number; agreement?: Map<AiScale, number>;
}) {
  const showAgree = !!agreement && agreement.size > 0;
  const rows = kinds
    .map((k) => ({ k, best: Math.max(...models.map((m) => m.deltas.get(k) ?? -1)) }))
    .sort((a, b) => b.best - a.best);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `minmax(0,1fr) repeat(${models.length + (showAgree ? 1 : 0)}, 54px)`, gap: "7px 8px", alignItems: "baseline" }}>
      <span />
      {models.map((m) => <span key={m.key} className="eyebrow" style={{ textAlign: "right" }}>{m.short}</span>)}
      {showAgree && <span className="eyebrow" style={{ textAlign: "right" }}>Einig</span>}
      {rows.map(({ k }) => {
        const scale = k.startsWith("ki_") ? (k.slice(3) as AiScale) : null;
        const agree = scale && scale in AI_SCALES ? agreement?.get(scale) : undefined;
        return (
          <Fragment key={k}>
            <span className="small">{KIND_NAMES[k].replace(/^KI: /, "")}</span>
            {models.map((m) => <Delta key={m.key} v={m.deltas.get(k)} noise={noise} />)}
            {showAgree && <span className="caption" style={{ textAlign: "right" }}>{agree != null ? pct(agree) : ""}</span>}
          </Fragment>
        );
      })}
    </div>
  );
}

export default async function KiArea({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [statusRated, statusTest, { rated }, ai, duel, cards] = await Promise.all([
    aiPilotStatus("rated"),
    aiPilotStatus("test"),
    loadTasteData(supabase, userId, false),
    loadAiFeatures(supabase),
    duelResults().catch(() => null),
    duelCards().catch(() => []),
  ]);
  return <KiView statusRated={statusRated} statusTest={statusTest} cmp={compareModels(rated, ai)} duel={duel} cards={cards} />;
}

type Props = {
  statusRated: AiStatus[] | null;
  statusTest: AiStatus[] | null;
  cmp: ReturnType<typeof compareModels>;
  duel: Awaited<ReturnType<typeof duelResults>>;
  cards: DuelCard[];
};

export function KiView({ statusRated, statusTest, cmp, duel, cards }: Props) {
  const totalCost = [...(statusRated ?? []), ...(statusTest ?? [])].reduce((s, x) => s + x.costUsd, 0);
  const aiModels = cmp?.results.filter((r) => r.key !== "ohne") ?? [];
  const base = cmp?.results.find((r) => r.key === "ohne");
  const best = aiModels.reduce<ModelResult | null>((a, b) => (!a || b.accuracy > a.accuracy ? b : a), null);
  const missing = (statusRated ?? []).filter((s) => s.done < 20);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p className="caption" style={{ margin: 0 }}>
        Hier testen wir, ob die KI-Merkmale (Stufe 2) die Vorschläge besser machen – und welches Modell dafür taugt.
        Bisher ausgegeben: <strong>{usd(totalCost)}</strong>.
      </p>

      {/* 1 – Einschätzungen */}
      <div className="panel">
        <div className="eyebrow" style={{ marginBottom: 4 }}>1 · KI-Einschätzungen deiner bewerteten Filme</div>
        <p className="caption" style={{ marginTop: 0 }}>
          Die KI schätzt 15 Merkmale ein (Stimmung, Tempo, Komplexität, Spannung, Humor, Härte, Grauzonen, offenes Ende, Nachwirkung …).
          Jeder Film wird pro Modell nur einmal eingeschätzt.
        </p>
        <AiPilot status={statusRated} />
      </div>

      {/* 2 – Vergleich */}
      <div className="panel">
        <div className="eyebrow" style={{ marginBottom: 4 }}>2 · Vergleich im Messtest</div>
        {!cmp || !base ? (
          <p className="caption" style={{ margin: 0 }}>Dafür braucht es mindestens 20 bewertete Filme.</p>
        ) : (
          <>
            <p className="caption" style={{ marginTop: 0 }}>
              Wie gut sagt die App deine {cmp.count} Bewertungen voraus? 50 % = Raten. „Nur Geschmack“ = was du anders siehst als die allgemeine Meinung.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 62px 62px 62px", gap: "8px 8px", alignItems: "baseline" }}>
              <span />
              <span className="eyebrow" style={{ textAlign: "right" }}>Gesamt</span>
              <span className="eyebrow" style={{ textAlign: "right" }}>Gewinn</span>
              <span className="eyebrow" style={{ textAlign: "right" }}>Geschm.</span>
              {cmp.results.map((r) => (
                <Fragment key={r.key}>
                  <span style={{ fontWeight: r === best ? 700 : 500 }}>{r.name}{r === best ? " ★" : ""}</span>
                  <span style={{ textAlign: "right", fontWeight: 600 }}>{pct(r.accuracy)}</span>
                  {r.key === "ohne" ? <span className="caption" style={{ textAlign: "right" }}>–</span> : <Delta v={r.accuracy - base.accuracy} noise={cmp.noise} />}
                  <span className="caption" style={{ textAlign: "right" }}>{pct(r.tasteOnly)}</span>
                </Fragment>
              ))}
            </div>
            {missing.length > 0 && (
              <p className="caption">{missing.map((m) => m.model === "sonnet" ? "Sonnet" : "Haiku").join(" und ")} erscheint hier, sobald mindestens 20 deiner Filme eingeschätzt sind (siehe 1).</p>
            )}
            {best && (
              <p className="small" style={{ marginBottom: 0 }}>
                {best.accuracy - base.accuracy > cmp.noise
                  ? <>Bisher am treffsichersten: <strong>{best.name}</strong> ({pp(best.accuracy - base.accuracy)} Punkte gegenüber ohne KI).</>
                  : <>Bisher bringt noch kein Modell einen deutlichen Gewinn (unter {pp(cmp.noise).slice(1)} Punkten ist Zufall).</>}
              </p>
            )}

            {aiModels.length > 0 && (
              <>
                <div className="eyebrow" style={{ margin: "18px 0 4px" }}>KI-Merkmale im Vergleich</div>
                <p className="caption" style={{ marginTop: 0 }}>
                  Prozentpunkte, um die die Treffsicherheit ohne dieses Merkmal sinkt.{" "}
                  <span style={{ color: "var(--ok)" }}>Grün = hilft</span>, <span style={{ color: "var(--danger)" }}>Rot = stört</span>, grau = Zufall.
                  {cmp.agreement.size > 0 && " „Einig“ = wie oft beide Modelle dieselbe Stufe (wenig / mittel / viel) vergeben."}
                </p>
                <FeatureTable kinds={cmp.aiKinds} models={aiModels} noise={cmp.noise} agreement={cmp.agreement} />
                <details style={{ marginTop: 14 }}>
                  <summary className="caption" style={{ cursor: "pointer" }}>Übrige Merkmale (Regie, Genres, Besetzung …) ›</summary>
                  <div style={{ marginTop: 10 }}>
                    <FeatureTable kinds={cmp.otherKinds} models={[base, ...aiModels.filter((m) => !m.key.endsWith("_ki"))]} noise={cmp.noise} />
                  </div>
                </details>
                <p className="caption" style={{ marginBottom: 0 }}>
                  Ähnliche Merkmale (z. B. Düsternis und Grundstimmung) ersetzen sich teilweise gegenseitig und wirken einzeln daher kleiner.
                  Entscheidend ist die Gesamtzahl oben.
                </p>
              </>
            )}
          </>
        )}
      </div>

      {/* 3 – Modell-Duell */}
      <div className="panel">
        <div className="eyebrow" style={{ marginBottom: 4 }}>3 · Modell-Duell (blind)</div>
        <p className="caption" style={{ marginTop: 0 }}>
          Drei Varianten wählen ihre besten Vorschläge aus Filmen, die du noch nicht bewertet hast: ohne KI (so arbeitet die App jetzt),
          Haiku mit allen Merkmalen und Haiku nur mit Qualität + KI-Merkmalen. Abwechslungsreich: höchstens ein Film pro Filmreihe, höchstens zwei pro Regie.
          Du siehst nicht, welcher Vorschlag von wem kommt, und sagst nur: passt zu mir oder nicht.
          Diese Antworten fließen <strong>nicht</strong> in dein Geschmacksprofil ein.
        </p>
        {!duel ? (
          <p className="caption" style={{ margin: 0 }}>Zuerst die <strong>Ergänzung 14</strong> im Supabase SQL Editor ausführen, dann diese Seite neu laden.</p>
        ) : duel.pool === 0 ? (
          <>
            <p className="small">Schritt 1: Die App wählt 100 Testfilme aus (50, die sie schon jetzt für passend hält, und 50 zufällige solide Filme – bunt gemischt).</p>
            <PrepareButton />
          </>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <p className="small" style={{ marginTop: 0 }}>Schritt 2: Haiku schätzt die {duel.pool} Testfilme ein.</p>
              <AiPilot status={statusTest} scope="test" models={DUEL_MODELS} />
            </div>
            <div>
              <p className="small" style={{ marginTop: 0 }}>Schritt 3: Blind bewerten.</p>
              {cards.length > 0 ? <DuelDeck cards={cards} /> : (
                <>
                  <p className="caption">
                    Jede Variante schlägt 10 Filme vor (doppelte erscheinen nur einmal). Haiku macht mit, sobald es deine Filme und fast alle Testfilme eingeschätzt hat.
                  </p>
                  <RoundButton label={duel.answered ? "Nächste Runde starten" : "Erste Runde starten"} />
                </>
              )}
            </div>
            {duel.results.some((r) => r.passt + r.nicht + r.gesehen > 0) && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Auswertung</div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 50px 50px 50px 62px", gap: "8px 8px", alignItems: "baseline" }}>
                  <span />
                  <span className="eyebrow" style={{ textAlign: "right" }}>Passt</span>
                  <span className="eyebrow" style={{ textAlign: "right" }}>Nicht</span>
                  <span className="eyebrow" style={{ textAlign: "right" }}>Ges.</span>
                  <span className="eyebrow" style={{ textAlign: "right" }}>Treffer</span>
                  {duel.results.map((r) => {
                    const judged = r.passt + r.nicht;
                    return (
                      <Fragment key={r.source}>
                        <span>{r.name}</span>
                        <span style={{ textAlign: "right" }}>{r.passt}</span>
                        <span style={{ textAlign: "right" }}>{r.nicht}</span>
                        <span className="caption" style={{ textAlign: "right" }}>{r.gesehen}</span>
                        <span style={{ textAlign: "right", fontWeight: 700 }}>{judged ? pct(r.passt / judged) : "–"}</span>
                      </Fragment>
                    );
                  })}
                </div>
                <p className="caption">
                  Treffer = Anteil der Vorschläge, die zu dir passen („schon gesehen“ zählt nicht mit). Ab etwa 20 bewerteten
                  Vorschlägen pro Variante wird der Vergleich aussagekräftig – also lieber 2–3 Runden machen.
                </p>
              </div>
            )}
            <div className="row" style={{ justifyContent: "space-between" }}>
              {duel.answered >= duel.pool - 20 && <PrepareButton label="100 weitere Testfilme" />}
              <ResetButton />
            </div>
          </div>
        )}
      </div>

      <Link href="/messtest" className="caption">Zum ausführlichen Messtest ›</Link>
    </div>
  );
}
