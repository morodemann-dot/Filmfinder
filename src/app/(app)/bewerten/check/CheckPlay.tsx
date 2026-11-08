"use client";

import { useState } from "react";
import Link from "next/link";
import DuelDeck, { type DeckLabels } from "@/app/(app)/admin/DuelDeck";
import { checkAnswer, checkCards, checkStart } from "@/app/check-actions";
import type { DuelCard } from "@/app/ki-actions";

const LABELS: DeckLabels = {
  yes: "Würde ich schauen", mid: "Geht so", no: "Eher nicht",
  stampYes: "SCHAUE ICH", stampMid: "GEHT SO", stampNo: "EHER NICHT", eyebrow: "Würdest du den schauen?",
};

export default function CheckPlay({ initialCards, answered, onRoundDone }: {
  initialCards: DuelCard[]; answered: number; onRoundDone?: () => void; // Tutorial: nach einer Runde weiter
}) {
  const [cards, setCards] = useState(initialCards);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(answered);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await checkStart();
      if (r.error) { setMsg(r.error); return; }
      if (!r.cards) { setMsg("Gerade keine passenden Filme mehr – schau später wieder rein."); return; }
      setCards(await checkCards());
      setRound((n) => n + 1);
      setFinished(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Fehler beim Starten");
    } finally {
      setBusy(false);
    }
  }

  if (cards.length && !finished) {
    return <DuelDeck key={round} cards={cards} labels={LABELS}
      onAnswer={async (id, a) => { await checkAnswer(id, a); if (a === "passt" || a === "okay" || a === "passt_nicht") setDone((n) => n + 1); }}
      onFinished={() => { if (onRoundDone) { onRoundDone(); return; } setFinished(true); setCards([]); }} />;
  }
  return (
    <div className="panel" style={{ textAlign: "center", display: "grid", gap: 10 }}>
      {finished ? (
        <>
          <div style={{ fontSize: "2rem" }} aria-hidden>✦</div>
          <strong>Danke! Die App hat dazugelernt.</strong>
          <span className="caption">Bisher {done} Antworten im Geschmacks-Check. Deine Vorschläge im Filmfinder sind schon angepasst.</span>
        </>
      ) : (
        <>
          <strong>10 Filme, 1 Minute</strong>
          <span className="caption">
            Du siehst Filme, die du wahrscheinlich noch nicht kennst. Sag einfach, ob sie dich reizen würden.
            So lernt die App deinen Geschmack viel schneller als nur übers Bewerten.
          </span>
        </>
      )}
      <button className="btn primary" disabled={busy} onClick={start}>
        {busy ? "Stelle Filme zusammen …" : finished ? "Noch 10 Filme" : "Los geht’s"}
      </button>
      {finished && <Link href="/" className="btn">Zu meinen Vorschlägen ›</Link>}
      {msg && <p className="error" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}
