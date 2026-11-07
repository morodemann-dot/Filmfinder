"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Poster from "@/components/Poster";
import Score from "@/components/Score";
import { AspectSheet } from "@/components/QuestionSheet";
import CheckPlay from "@/app/(app)/bewerten/check/CheckPlay";
import { saveAspects, setFavorite } from "@/app/actions";
import { addFavorite, finishOnboarding, searchFavorites, type FavHit, type FavItem } from "@/app/onboarding-actions";
import type { AspectInfo } from "@/lib/aspects";

const MIN = 10, MAX = 15;
type Step = "hallo" | "lieblinge" | "check" | "fertig";
type Asking = { hit: FavHit; rating: number | null; saved: { id: number; info: AspectInfo & { title: string } } | null };

export default function Onboarding({ initialFavorites }: { initialFavorites: FavItem[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("hallo");
  const [favs, setFavs] = useState<FavItem[]>(initialFavorites);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const steps: Step[] = ["hallo", "lieblinge", "check", "fertig"];
  const at = steps.indexOf(step);

  async function chooseRating(r: number) {
    if (!asking) return;
    setAsking({ ...asking, rating: r }); setError(null);
    try {
      const saved = await addFavorite(asking.hit.tmdb_id, r);
      setAsking((a) => (a ? { ...a, rating: r, saved } : a));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konnte nicht speichern.");
      setAsking(null);
    }
  }

  async function reasonsDone(aspects: string[]) {
    if (!asking?.saved) return;
    const { saved, hit, rating } = asking;
    setAsking(null);
    setFavs((f) => [...f.filter((x) => x.id !== saved.id), { id: saved.id, title: saved.info.title, year: hit.year ? Number(hit.year) : null, poster_path: hit.poster_path, rating, hasReasons: true }]);
    saveAspects(saved.id, aspects).catch(() => setError("Begründung konnte nicht gespeichert werden."));
  }

  async function done() {
    setBusy(true);
    try { await finishOnboarding(); router.replace("/"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Fehler"); setBusy(false); }
  }

  return (
    <div className="onb">
      <div className="onb-dots" aria-label={`Schritt ${at + 1} von 4`}>
        {steps.map((s, i) => <span key={s} className={i <= at ? "on" : ""} />)}
      </div>

      {step === "hallo" && (
        <div className="onb-hero">
          <div className="onb-logo">Film<span>finder</span></div>
          <h1>Lass uns deinen Geschmack kennenlernen</h1>
          <p className="onb-lead">Zwei kurze Schritte, dann bekommst du Vorschläge, die wirklich zu dir passen – unabhängig vom Streamingdienst.</p>
          <ol className="onb-steps">
            <li><strong>Deine Lieblingsfilme</strong><span>{MIN}–{MAX} Filme suchen und kurz sagen, was du an ihnen liebst.</span></li>
            <li><strong>Geschmacks-Check</strong><span>10 Filme, die du vermutlich nicht kennst: reizt dich das – oder eher nicht?</span></li>
          </ol>
          <button className="btn primary onb-cta" onClick={() => setStep("lieblinge")}>Los geht’s</button>
        </div>
      )}

      {step === "lieblinge" && (
        <>
          <h1 className="page-title-compact">Deine Lieblingsfilme</h1>
          <p className="caption" style={{ marginTop: 0 }}>
            Such {MIN}–{MAX} Filme, die du liebst. Bei jedem fragen wir kurz: Wie viele Punkte – und was macht ihn für dich besonders?
          </p>
          <FavSearch disabled={favs.length >= MAX} known={new Set(favs.map((f) => f.title))}
            onPick={(hit) => { setError(null); setAsking({ hit, rating: null, saved: null }); }} />
          {error && <p className="error">{error}</p>}

          <div className="onb-count">
            <div className="progress"><div style={{ width: `${Math.min(100, (favs.length / MIN) * 100)}%` }} /></div>
            <span className="caption">{favs.length} / {MIN}{favs.length >= MIN ? ` · bis zu ${MAX}` : ""}</span>
          </div>
          <div className="onb-grid">
            {favs.map((f) => (
              <div key={f.id} className="onb-fav">
                <Poster path={f.poster_path} title={f.title} />
                <button className="onb-remove" aria-label={`${f.title} entfernen`}
                  onClick={() => { setFavs((x) => x.filter((y) => y.id !== f.id)); setFavorite(f.id, false).catch(() => {}); }}>✕</button>
                <span className="onb-fav-rating">♥ {f.rating ?? "–"}</span>
              </div>
            ))}
          </div>
          <div className="onb-bottom">
            <button className="btn primary onb-cta" disabled={favs.length < MIN} onClick={() => setStep("check")}>
              {favs.length < MIN ? `Noch ${MIN - favs.length} Lieblingsfilm${MIN - favs.length === 1 ? "" : "e"}` : "Weiter zum Geschmacks-Check"}
            </button>
          </div>
        </>
      )}

      {step === "check" && (
        <>
          <h1 className="page-title-compact">Geschmacks-Check</h1>
          <p className="caption" style={{ marginTop: 0 }}>
            Aufgebaut auf deinen Lieblingsfilmen: Würden dich diese Filme reizen? Rechts = reizt mich, links = eher nicht.
          </p>
          <CheckPlay initialCards={[]} answered={0} onRoundDone={() => setStep("fertig")} />
        </>
      )}

      {step === "fertig" && (
        <div className="onb-hero">
          <div className="onb-burst" aria-hidden>✦</div>
          <h1>Fertig – die App kennt dich jetzt</h1>
          <p className="onb-lead">
            Aus {favs.length} Lieblingsfilmen und deinem Geschmacks-Check sind deine ersten Vorschläge entstanden.
            Je mehr du bewertest und wischst, desto besser werden sie.
          </p>
          <button className="btn primary onb-cta" disabled={busy} onClick={done}>{busy ? "Einen Moment …" : "Zu meinen Vorschlägen"}</button>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* Lieblingsfilm: erst Punkte, dann (Pflicht) was du an ihm liebst */}
      {asking && !asking.saved && (
        <div className="onb-sheet-backdrop">
          <div className="question-sheet onb-sheet" role="dialog" aria-label="Punkte für deinen Lieblingsfilm">
            <div className="row" style={{ gap: 12, alignItems: "center", marginBottom: 10 }}>
              <div style={{ width: 56, flex: "none" }}><Poster path={asking.hit.poster_path} title={asking.hit.title} /></div>
              <div style={{ textAlign: "left" }}>
                <div className="eyebrow">♥ Lieblingsfilm</div>
                <strong>{asking.hit.title}</strong>{asking.hit.year && <span className="caption"> · {asking.hit.year}</span>}
              </div>
            </div>
            <div className="caption" style={{ marginBottom: 8 }}>Wie viele Punkte gibst du ihm? (Ein Lieblingsfilm muss keine 10 sein.)</div>
            <Score value={asking.rating} onChange={chooseRating} hint={asking.rating ? "Speichere …" : "Tippe eine Zahl an."} />
            <button className="linkish" style={{ marginTop: 10 }} onClick={() => setAsking(null)} disabled={asking.rating != null}>Abbrechen</button>
          </div>
        </div>
      )}
      {asking?.saved && asking.rating != null && (
        <div className="onb-sheet-backdrop">
          <AspectSheet className="onb-sheet" required title={asking.saved.info.title} info={asking.saved.info} rating={asking.rating}
            groupsRating={Math.max(9, asking.rating)} heading="Was liebst du an diesem Film?" onDone={reasonsDone} />
        </div>
      )}
    </div>
  );
}

// Suchleiste mit Live-Ergebnissen
function FavSearch({ onPick, disabled, known }: { onPick: (h: FavHit) => void; disabled: boolean; known: Set<string> }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FavHit[]>([]);
  const [loading, setLoading] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const n = ++last.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try { const r = await searchFavorites(term); if (n === last.current) setHits(r); }
      finally { if (n === last.current) setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const shown = q.trim().length >= 2 ? hits : [];
  return (
    <div className="onb-search">
      <input className="input" type="search" placeholder={disabled ? "Maximum erreicht" : "Film suchen, z. B. Heat"} value={q}
        disabled={disabled} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
      {loading && <div className="caption" style={{ padding: "8px 4px" }}>Suche …</div>}
      {shown.length > 0 && (
        <ul className="onb-hits">
          {shown.map((h) => {
            const already = known.has(h.title);
            return (
              <li key={h.tmdb_id}>
                <button disabled={already} onClick={() => { onPick(h); setQ(""); setHits([]); }}>
                  <span className="onb-hit-poster"><Poster path={h.poster_path} title={h.title} size="w185" /></span>
                  <span className="onb-hit-text"><strong>{h.title}</strong><span className="caption">{h.year ?? ""}</span></span>
                  <span className="onb-hit-add" aria-hidden>{already ? "✓" : "♥ +"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
