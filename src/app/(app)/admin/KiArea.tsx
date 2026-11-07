import { Fragment, Suspense, type ReactNode } from "react";
import Link from "next/link";
import AiPilot from "./AiPilot";
import DuelPlay from "./DuelPlay";
import { ResetButton } from "./DuelControls";
import { aiPilotStatus, type AiStatus } from "@/app/catalog-actions";
import { duelAnswers, duelCards, duelResults, type DuelCard } from "@/app/ki-actions";
import { createClient } from "@/lib/supabase/server";
import { loadAiFeatures, loadTasteData } from "@/lib/tasteData";
import { compareModels, type ModelResult } from "@/lib/aiCompare";
import { KIND_NAMES, type FeatureKind } from "@/lib/recommend";
import { AI_SCALES, type AiScale } from "@/lib/aiFeatures";
import { DUEL_MODELS, DUEL_SOURCES, EVAL_SOURCES, duelAucCV } from "@/lib/duel";
import type { Title } from "@/lib/types";

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
  const [statusRated, statusTest, duel, cards] = await Promise.all([
    aiPilotStatus("rated"),
    aiPilotStatus("test"),
    duelResults().catch(() => null),
    duelCards().catch(() => []),
  ]);
  return (
    <KiView statusRated={statusRated} statusTest={statusTest} duel={duel} cards={cards}
      compareSlot={<KiCompareSlot userId={userId} statusRated={statusRated} />}
      retroSlot={<KiRetroSlot userId={userId} />} />
  );
}

type Retro = { key: string; name: string; inDuel: boolean; auc: number | null; yes: number; no: number };

type Props = {
  retro?: Retro[];
  statusRated: AiStatus[] | null;
  statusTest: AiStatus[] | null;
  cmp?: ReturnType<typeof compareModels>;
  compareSlot?: ReactNode; // wird nachgeladen (rechenintensiv)
  retroSlot?: ReactNode; // wird nachgeladen (rechenintensiv)
  duel: Awaited<ReturnType<typeof duelResults>>;
  cards: DuelCard[];
};

export function KiView({ statusRated, statusTest, cmp = null, duel, cards, retro = [], compareSlot, retroSlot }: Props) {
  const totalCost = [...(statusRated ?? []), ...(statusTest ?? [])].reduce((s, x) => s + x.costUsd, 0);

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
        {compareSlot ?? <CompareBody cmp={cmp} statusRated={statusRated} />}
      </div>

      {/* 3 – Modell-Duell */}
      <div className="panel">
        <div className="eyebrow" style={{ marginBottom: 4 }}>3 · Modell-Duell (blind)</div>
        <p className="caption" style={{ marginTop: 0 }}>
          Drei Varianten wählen ihre besten Vorschläge aus dem ganzen Katalog – wie der echte Filmfinder (ab 1980, nichts schon Eingeordnetes,
          keine weiteren Teile bekannter Reihen): die neue App (alle Verbesserungen), die alte App und „alle Verbesserungen ohne Ähnlichkeit“. Ganz ohne KI.
          Weitere Filme derselben Reihe oder Regie sind erlaubt, bekommen aber einen kleinen Abzug – so bleibt es abwechslungsreich.
          Du siehst nicht, welcher Vorschlag von wem kommt, und sagst nur: passt zu mir oder nicht.
          Diese Antworten fließen <strong>nicht</strong> in dein Geschmacksprofil ein.
        </p>
        {!duel ? (
          <p className="caption" style={{ margin: 0 }}>Zuerst die <strong>Ergänzung 14</strong> im Supabase SQL Editor ausführen, dann diese Seite neu laden.</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {DUEL_MODELS.length > 0 && (
              <div>
                <p className="small" style={{ marginTop: 0 }}>Schritt 2: Die KI schätzt die {duel.pool} Testfilme ein.</p>
                <AiPilot status={statusTest} scope="test" models={DUEL_MODELS} />
              </div>
            )}
            <div>
              <p className="small" style={{ marginTop: 0 }}>Blind bewerten:</p>
              <DuelPlay initialCards={cards} answered={duel.answered} />
            </div>
            {retroSlot ?? <RetroBody retro={retro} />}
            {duel.recent.results.some((r) => r.passt + r.nicht > 0) && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Auswertung – gleiche Runden</div>
                <p className="caption" style={{ marginTop: 0 }}>
                  Nur die Runden, in denen alle drei aktuellen Varianten gleichzeitig angetreten sind – so ist der Vergleich fair.
                </p>
                <ResultsTable results={duel.recent.results} />
              </div>
            )}
            {duel.results.some((r) => r.passt + r.nicht + r.gesehen > 0) && (
              <details>
                <summary className="caption" style={{ cursor: "pointer" }}>Alle Runden seit Beginn ›</summary>
                <div style={{ marginTop: 10 }}><ResultsTable results={duel.results} /></div>
              </details>
            )}
            <p className="caption" style={{ margin: 0 }}>
              Treffer = Anteil der Vorschläge, die zu dir passen („schon gesehen“ zählt nicht mit). Bei der <strong>Gegenprobe</strong> ist es
              umgekehrt: Treffer = die App hat richtig vorhergesagt, dass der Film <em>nicht</em> passt. Ab etwa 20 bewerteten Karten pro Zeile wird es aussagekräftig.
            </p>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span />
              <ResetButton />
            </div>
          </div>
        )}
      </div>

      <Link href="/messtest" className="caption">Zum ausführlichen Messtest ›</Link>
    </div>
  );
}

// ---- Abschnitt 2: Vergleich im Messtest ----
function CompareBody({ cmp, statusRated }: { cmp: ReturnType<typeof compareModels>; statusRated: AiStatus[] | null }) {
  const aiModels = cmp?.results.filter((r) => r.key !== "ohne") ?? [];
  const base = cmp?.results.find((r) => r.key === "ohne");
  const best = aiModels.reduce<ModelResult | null>((a, b) => (!a || b.accuracy > a.accuracy ? b : a), null);
  const missing = (statusRated ?? []).filter((s) => s.done < 20);
  return (
    <>
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
    </>
  );
}

// ---- Nachträglicher Test ----
function RetroBody({ retro }: { retro: Retro[] }) {
  return (
    <>
            {retro.length > 0 && retro[0].auc != null && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Nachträglicher Test auf deinen Antworten</div>
                <p className="caption" style={{ marginTop: 0 }}>
                  Wie oft hätte jede Variante einen Film, der dir gepasst hat ({retro[0].yes}), höher eingestuft als einen, der nicht gepasst hat
                  ({retro[0].no})? 50 % = Raten. So lassen sich auch neue Varianten prüfen, ohne neu zu tindern.
                  {" "}Fair geteilt: Varianten mit „Duell-Antworten“ lernen immer nur aus 4/5 deiner Antworten und müssen das
                  übrige Fünftel vorhersagen (fünfmal, bis jede Antwort einmal geprüft wurde).
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 62px", gap: "8px 8px", alignItems: "baseline" }}>
                  {[...retro].sort((a, b) => (b.auc ?? 0) - (a.auc ?? 0)).map((r, i) => (
                    <Fragment key={r.key}>
                      <span style={{ fontWeight: i === 0 ? 700 : 500 }}>{r.name}{i === 0 ? " ★" : ""}{r.inDuel && <span className="caption"> · im Duell</span>}</span>
                      <span style={{ textAlign: "right", fontWeight: 700, color: (r.auc ?? 0) > 0.55 ? "var(--ok)" : (r.auc ?? 0) < 0.45 ? "var(--danger)" : undefined }}>{r.auc != null ? pct(r.auc) : "–"}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
    </>
  );
}

// Nachgeladene Teile (der Rest der Seite erscheint sofort)
const Loading = ({ what }: { what: string }) => <p className="caption" style={{ margin: 0 }}>{what} wird berechnet …</p>;

async function CompareSection({ userId, statusRated }: { userId: string; statusRated: AiStatus[] | null }) {
  const supabase = await createClient();
  const [{ rated }, ai] = await Promise.all([loadTasteData(supabase, userId, false), loadAiFeatures(supabase)]);
  return <CompareBody cmp={compareModels(rated, ai)} statusRated={statusRated} />;
}

async function RetroSection({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ rated, catalog }, ai, answers] = await Promise.all([
    loadTasteData(supabase, userId), loadAiFeatures(supabase), duelAnswers().catch(() => new Map<number, boolean>()),
  ]);
  if (answers.size < 6) return null;
  const { data } = await supabase.from("titles").select("*").in("id", [...answers.keys()]);
  const films = (data ?? []) as Title[];
  const retro: Retro[] = EVAL_SOURCES
    .filter((src) => !src.model || (ai.get(src.model)?.size ?? 0) > 0)
    .map((src) => ({ key: src.key, name: src.name, inDuel: DUEL_SOURCES.includes(src), ...duelAucCV(src, rated, catalog, ai, films, answers) }));
  return <RetroBody retro={retro} />;
}

export const KiCompareSlot = ({ userId, statusRated }: { userId: string; statusRated: AiStatus[] | null }) =>
  <Suspense fallback={<Loading what="Der Vergleich" />}><CompareSection userId={userId} statusRated={statusRated} /></Suspense>;
export const KiRetroSlot = ({ userId }: { userId: string }) =>
  <Suspense fallback={<Loading what="Der nachträgliche Test" />}><RetroSection userId={userId} /></Suspense>;

// Auswertungstabelle – bei der Gegenprobe zählt "passt nicht" als Treffer
function ResultsTable({ results }: { results: { source: string; name: string; passt: number; nicht: number; gesehen: number }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 46px 46px 40px 58px", gap: "8px 8px", alignItems: "baseline" }}>
      <span />
      <span className="eyebrow" style={{ textAlign: "right" }}>Passt</span>
      <span className="eyebrow" style={{ textAlign: "right" }}>Nicht</span>
      <span className="eyebrow" style={{ textAlign: "right" }}>Ges.</span>
      <span className="eyebrow" style={{ textAlign: "right" }}>Treffer</span>
      {results.map((r) => {
        const judged = r.passt + r.nicht;
        const neg = r.source === "probe-neg";
        const probe = r.source.startsWith("probe-");
        return (
          <Fragment key={r.source}>
            <span className={probe ? "caption" : undefined} style={probe ? { fontStyle: "italic" } : undefined}>{r.name}</span>
            <span style={{ textAlign: "right" }}>{r.passt}</span>
            <span style={{ textAlign: "right" }}>{r.nicht}</span>
            <span className="caption" style={{ textAlign: "right" }}>{r.gesehen}</span>
            <span style={{ textAlign: "right", fontWeight: 700 }}>{judged ? pct((neg ? r.nicht : r.passt) / judged) : "–"}</span>
          </Fragment>
        );
      })}
    </div>
  );
}
