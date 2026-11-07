"use client";

import { useState, useTransition } from "react";
import { saveProfile } from "@/app/actions";

// Profil für die Freunde-Funktionen: Anzeigename + Freigabe fürs gemeinsame Schauen.
export default function ProfilePanel({ name, share, ready }: { name: string; share: boolean; ready: boolean }) {
  const [n, setN] = useState(name);
  const [s, setS] = useState(share);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!ready) {
    return <p className="caption">Profil: Zuerst muss die Ergänzung 15 im Supabase SQL Editor ausgeführt werden.</p>;
  }
  return (
    <details className="panel" style={{ marginTop: 28 }} open={!name}>
      <summary className="eyebrow" style={{ cursor: "pointer" }}>Profil & gemeinsam schauen</summary>
      <p className="caption">
        Gib dir einen Namen und erlaube „Gemeinsam schauen“. Dann kannst du im Filmfinder oben „Mit …“ wählen und bekommst Filme,
        die euch beiden gefallen dürften – sofern dein Freund das auch erlaubt hat. Eure einzelnen Bewertungen sieht dabei niemand.
      </p>
      <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
        <input className="input" placeholder="Anzeigename, z. B. Moritz" value={n} maxLength={40} onChange={(e) => setN(e.target.value)} />
        <label className="row" style={{ gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={s} onChange={(e) => setS(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
          <span>Gemeinsames Schauen erlauben</span>
        </label>
        <button className="btn primary" disabled={pending || (s && !n.trim())} onClick={() => start(async () => {
          setMsg(null);
          try { await saveProfile(n, s); setMsg("Gespeichert."); } catch (e) { setMsg(e instanceof Error ? e.message : "Fehler"); }
        })}>{pending ? "Speichere …" : "Speichern"}</button>
        {s && !n.trim() && <span className="caption">Für gemeinsames Schauen braucht es einen Namen.</span>}
        {msg && <span className="caption">{msg}</span>}
      </div>
    </details>
  );
}
