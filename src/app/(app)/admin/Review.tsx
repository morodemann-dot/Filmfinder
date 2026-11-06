"use client";

import { useState, useTransition } from "react";
import Curate from "./Curate";
import { acceptAllCandidates, candidateCount, discardAllCandidates } from "@/app/catalog-actions";

// "Neu prüfen": vorgeschlagene Filme wischen – rechts = in den Katalog, links = ablehnen (Sperrliste).
export default function Review({ genres, initialCount }: { genres: string[]; initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [confirm, setConfirm] = useState<"accept" | "discard" | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [deckKey, setDeckKey] = useState(0);

  const refresh = () => { candidateCount().then(setCount).catch(() => {}); };

  function all(kind: "accept" | "discard") {
    start(async () => {
      const r = kind === "accept" ? await acceptAllCandidates() : await discardAllCandidates();
      setMessage(kind === "accept" ? `${(r as { accepted: number }).accepted} Filme übernommen.` : `${(r as { discarded: number }).discarded} Kandidaten verworfen.`);
      setConfirm(null);
      setCount(0);
      setDeckKey((k) => k + 1);
    });
  }

  return (
    <div>
      <p className="caption" style={{ marginTop: 0 }}>
        Rechts wischen = in den Katalog · links wischen = ablehnen (kommt auf die Sperrliste).
        Alles hier hat die Katalog-Regeln schon bestanden.
      </p>
      {count > 0 && (
        <div className="row" style={{ marginBottom: 12 }}>
          {confirm === null ? (
            <>
              <button className="btn" onClick={() => setConfirm("accept")}>Alle {count} übernehmen</button>
              <button className="btn ghost" onClick={() => setConfirm("discard")}>Alle verwerfen</button>
            </>
          ) : (
            <>
              <button className={`btn ${confirm === "discard" ? "danger" : "primary"}`} onClick={() => all(confirm)} disabled={pending}>
                {pending ? "Einen Moment …" : confirm === "accept" ? `Ja, alle ${count} übernehmen` : `Ja, alle ${count} verwerfen`}
              </button>
              <button className="btn" onClick={() => setConfirm(null)} disabled={pending}>Abbrechen</button>
            </>
          )}
        </div>
      )}
      {confirm === "discard" && <p className="caption">Verworfen heißt: nicht übernommen, aber auch nicht gesperrt – sie können später wieder vorgeschlagen werden.</p>}
      {message && <p className="success">{message}</p>}
      <Curate key={deckKey} genres={genres} mode="candidates" onDone={refresh} />
    </div>
  );
}
