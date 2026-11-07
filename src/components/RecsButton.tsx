"use client";

import { useEffect, useState } from "react";
import { enrichRecsChunk, recsStatus } from "@/app/catalog-actions";

// Lädt die TMDB-Empfehlungen ("Wer X mochte, mochte auch …") für alle Filme – in Etappen à 80 Filme.
export default function RecsButton() {
  const [status, setStatus] = useState<{ missing: number; total: number } | null | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { recsStatus().then(setStatus).catch(() => setStatus(null)); }, []);

  async function run() {
    if (!status) return;
    setRunning(true); setError(null);
    let d = 0, stalls = 0;
    try {
      for (;;) {
        const r = await enrichRecsChunk();
        d += r.done; setDone(d);
        if (r.error && r.done === 0) {
          // TMDB bremst kurz (zu viele Anfragen) → kurz warten und weiter
          if (++stalls > 4) throw new Error(r.error);
          await new Promise((ok) => setTimeout(ok, 4000));
          continue;
        }
        stalls = 0;
        if (r.remaining === 0) break;
      }
      setStatus(await recsStatus());
    } catch (e) {
      setError("Angehalten: " + (e instanceof Error ? e.message : String(e)) + " – einfach nochmal starten, Fertiges bleibt.");
    } finally {
      setRunning(false);
    }
  }

  if (status === undefined) return <p className="caption">Prüfe …</p>;
  if (status === null) return <p className="caption">Zuerst die <strong>Ergänzung 17</strong> im Supabase SQL Editor ausführen, dann die Seite neu laden.</p>;
  if (!running && status.missing === 0) return <p className="success">Alles geladen.</p>;
  const missing = status.missing;
  return (
    <div>
      <button className="btn primary" onClick={run} disabled={running}>
        {running ? `Lade … ${done} / ${missing}` : `Empfehlungen laden (${missing.toLocaleString("de-DE")} Filme, ca. ${Math.ceil(missing / 80 * 3 / 60)} Min.)`}
      </button>
      {running && <div className="progress" style={{ marginTop: 10 }}><div style={{ width: `${Math.min(100, (done / Math.max(1, missing)) * 100)}%` }} /></div>}
      {running && <p className="caption">Seite bitte offen lassen.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
