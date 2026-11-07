"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enrichWikidataChunk } from "@/app/catalog-actions";

// Lädt Wikidata-Infos für alle Filme – automatisch in Etappen à 150 Filme.
export default function WikidataButton({ missing }: { missing: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [found, setFound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  async function run() {
    setRunning(true); setError(null);
    let d = 0, f = 0;
    try {
      for (;;) {
        const r = await enrichWikidataChunk();
        d += r.done; f += r.found;
        setDone(d); setFound(f);
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

  if (finished) return <p className="success">Fertig – {found} von {done} Filmen bei Wikidata gefunden.</p>;
  return (
    <div>
      <button className="btn primary" onClick={run} disabled={running || missing === 0}>
        {running ? `Lade … ${done} / ${missing}` : missing ? `Wikidata-Infos laden (${missing} Filme)` : "Alles geladen"}
      </button>
      {running && <div className="progress" style={{ marginTop: 10 }}><div style={{ width: `${Math.min(100, (done / Math.max(1, missing)) * 100)}%` }} /></div>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
