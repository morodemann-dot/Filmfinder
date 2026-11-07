"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { duelPreparePool, duelReset, duelStartRound } from "@/app/ki-actions";

// Knöpfe fürs Modell-Duell: Testfilme auswählen, neue Runde, zurücksetzen
export function PrepareButton({ label = "100 Testfilme auswählen" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button className="btn primary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        const r = await duelPreparePool();
        setBusy(false);
        if (r.error) setMsg(r.error); else router.refresh();
      }}>{busy ? "Wähle aus …" : label}</button>
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}

export function RoundButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button className="btn primary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        const r = await duelStartRound();
        setBusy(false);
        if (r.error) setMsg(r.error);
        else if (!r.cards) setMsg("Keine offenen Testfilme mehr – wähle neue aus.");
        else router.refresh();
      }}>{busy ? "Stelle Runde zusammen …" : label}</button>
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}

export function ResetButton() {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  return sure ? (
    <span className="row" style={{ gap: 8 }}>
      <button className="btn danger" onClick={async () => { await duelReset(); setSure(false); router.refresh(); }}>Ja, Duell zurücksetzen</button>
      <button className="btn ghost" onClick={() => setSure(false)}>Abbrechen</button>
    </span>
  ) : (
    <button className="linkish" onClick={() => setSure(true)}>Duell zurücksetzen</button>
  );
}
