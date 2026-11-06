"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshChunk } from "@/app/actions";

// Lädt fehlende Daten (z. B. TMDB-Bewertungen) für alle Filme nach – automatisch in Etappen.
export default function RefreshButton({ missing, label = "Fehlende Daten laden" }: { missing: number; label?: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total] = useState(missing);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  async function run() {
    setRunning(true); setError(null);
    let count = 0;
    try {
      for (;;) {
        const r = await refreshChunk();
        count += r.done;
        setDone(count);
        if (r.remaining === 0 || r.done === 0) break;
      }
      setFinished(true);
      router.refresh();
    } catch (e) {
      setError("Abgebrochen: " + (e instanceof Error ? e.message : String(e)) + " – einfach nochmal starten.");
    } finally {
      setRunning(false);
    }
  }

  if (finished) return <p className="success">Fertig – alle Daten sind da.</p>;
  return (
    <div>
      <button className="btn primary" onClick={run} disabled={running}>
        {running ? `Lade … ${done}${total ? ` / ${total}` : " Filme"}` : total ? `${label} (${total} Filme)` : label}
      </button>
      {running && total > 0 && (
        <div className="progress" style={{ marginTop: 10 }}>
          <div style={{ width: `${Math.min(100, (done / Math.max(1, total)) * 100)}%` }} />
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
