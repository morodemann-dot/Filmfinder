"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DuelDeck from "./DuelDeck";
import { duelCards, duelStartRound, type DuelCard } from "@/app/ki-actions";

// Blind bewerten: Runde starten → Karten erscheinen sofort (ohne die ganze Seite neu zu berechnen)
export default function DuelPlay({ initialCards, answered }: { initialCards: DuelCard[]; answered: number }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [round, setRound] = useState(0); // neue Runde = neuer Stapel
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  async function start() {
    if (busy) return; // Doppelklick ignorieren
    setBusy(true); setMsg(null);
    try {
      const r = await duelStartRound();
      if (r.error) { setMsg(r.error); return; }
      if (!r.cards) { setMsg("Keine offenen Testfilme mehr – unten „100 weitere Testfilme“ wählen."); return; }
      setCards(await duelCards());
      setRound((n) => n + 1);
      setFinished(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Fehler beim Starten der Runde");
    } finally {
      setBusy(false);
    }
  }

  if (cards.length && !finished) {
    return <DuelDeck key={round} cards={cards} onFinished={() => { setFinished(true); setCards([]); }} />;
  }
  return (
    <div>
      {finished && <p className="small" style={{ marginTop: 0 }}>Runde geschafft.</p>}
      <p className="caption">Jede Variante schlägt 10 Filme vor (doppelte erscheinen nur einmal).</p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={busy} onClick={start}>
          {busy ? "Stelle Runde zusammen … (bis zu 20 Sek.)" : answered || finished ? "Nächste Runde starten" : "Erste Runde starten"}
        </button>
        {finished && <button className="btn" onClick={() => router.refresh()}>Auswertung aktualisieren</button>}
      </div>
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}
