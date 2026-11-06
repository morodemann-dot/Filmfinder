"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MIN_RATINGS } from "@/lib/onboarding";

// Einmalige Begrüßung für neue Nutzer (pro Gerät), solange noch zu wenig bewertet wurde.
const KEY = "ff-willkommen-gesehen";

export default function Welcome({ ratedCount }: { ratedCount: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (ratedCount >= MIN_RATINGS) return;
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch { /* z. B. privater Modus */ }
    if (!seen) {
      const t = setTimeout(() => setOpen(true), 300);
      return () => clearTimeout(t);
    }
  }, [ratedCount]);

  function close() {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={close}>
      <div className="welcome" onClick={(e) => e.stopPropagation()}>
        <div className="welcome-icon" aria-hidden>✦</div>
        <h2 id="welcome-title">Willkommen beim Filmfinder</h2>
        <p>
          Damit die App deinen Geschmack versteht, bewerte zuerst <strong>mindestens {MIN_RATINGS} Filme</strong>,
          die du schon kennst – von 1 bis 10. Je mehr, desto besser werden die Vorschläge.
        </p>
        {ratedCount > 0 && <p className="caption">Bisher bewertet: {ratedCount} von {MIN_RATINGS}</p>}
        <div className="welcome-actions">
          <Link href="/bewerten" className="btn primary" onClick={close}>Filme bewerten</Link>
          <Link href="/imdb" className="btn" onClick={close}>IMDb-Bewertungen importieren</Link>
          <button className="btn ghost" onClick={close}>Später</button>
        </div>
      </div>
    </div>
  );
}
