"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { aiPilotChunk, type AiScope, type AiStatus } from "@/app/catalog-actions";
import { AI_MODELS, type AiModelKey } from "@/lib/aiFeatures";

const usd = (x: number) => x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " $";

// Stufe 2 – Probelauf: die KI schätzt Filme ein (je Modell einmal).
// scope "rated" = deine bewerteten Filme, "test" = Testfilme fürs Modell-Duell
export default function AiPilot({ status, scope = "rated", showLink = false }: { status: AiStatus[] | null; scope?: AiScope; showLink?: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState<AiModelKey | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  if (!status) {
    return (
      <p className="caption" style={{ margin: 0 }}>
        Zuerst die <strong>Ergänzung 13</strong> im Supabase SQL Editor ausführen, dann diese Seite neu laden.
      </p>
    );
  }

  async function run(model: AiModelKey, already: number) {
    setRunning(model); setError(null); setSkipped(0);
    let done = already;
    let retries = 0;
    try {
      for (;;) {
        let r;
        try {
          r = await aiPilotChunk(model, scope);
          retries = 0;
        } catch (e) {
          // Kurze Verbindungsabbrüche: automatisch weitermachen (bereits Fertiges bleibt gespeichert)
          const msg = e instanceof Error ? e.message : String(e);
          const transient = !msg.includes("[kein Neuversuch]");
          if (transient && retries < 3) { retries++; await new Promise((ok) => setTimeout(ok, 3000)); continue; }
          throw transient ? new Error("Verbindung zum Server mehrfach abgebrochen – einfach nochmal starten, Fertiges bleibt erhalten.") : e;
        }
        done += r.done;
        setProgress((p) => ({ ...p, [model]: done }));
        if (r.fatal) throw new Error(r.fatal + " [kein Neuversuch]");
        if (r.errors.length) { setSkipped((s) => s + r.errors.length); setLastError(r.errors[0]); }
        if (r.remaining === 0 || r.done === 0) break;
      }
      router.refresh();
    } catch (e) {
      setError("Angehalten: " + (e instanceof Error ? e.message : String(e)).replace(" [kein Neuversuch]", ""));
      router.refresh();
    } finally {
      setRunning(null);
    }
  }

  const anyDone = status.some((s) => s.done > 0);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {status.map((s) => {
        const done = progress[s.model] ?? s.done;
        const m = AI_MODELS[s.model];
        const left = s.total - done;
        const estimate = left * (m.inPerM * 2200 + m.outPerM * 450) / 1e6; // grob: ~2.200 Tokens rein, ~450 raus
        return (
          <div key={s.model}>
            <div className="cov-head">
              <span><strong>{m.name}</strong> <span className="caption">{s.model === "haiku" ? "· schnell & günstig" : "· gründlicher"}</span></span>
              <span className="caption">{done} / {s.total} · bisher {usd(s.costUsd)}</span>
            </div>
            <div className="progress" style={{ margin: "6px 0 8px" }}>
              <div style={{ width: `${s.total ? (done / s.total) * 100 : 0}%` }} />
            </div>
            {left > 0 ? (
              <button className="btn" onClick={() => run(s.model, done)} disabled={running !== null}>
                {running === s.model ? `Läuft … ${done} / ${s.total}` : `${left} Filme einschätzen (ca. ${usd(estimate)})`}
              </button>
            ) : <span className="success">Fertig.</span>}
          </div>
        );
      })}
      {running && <p className="caption" style={{ margin: 0 }}>Seite bitte offen lassen – ca. 1–2 Sekunden pro Film.</p>}
      {skipped > 0 && <p className="caption" style={{ margin: 0 }}>{skipped} Filme übersprungen (werden beim nächsten Start erneut versucht){lastError ? ` – Grund: ${lastError}` : ""}.</p>}
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      {showLink && anyDone && !running && <Link href="/messtest" className="btn primary">Zum Messtest ›</Link>}
    </div>
  );
}
