import { Suspense } from "react";
import Link from "next/link";
import { userStats, type UserStat } from "@/lib/userStats";

const pct = (a: number, b: number) => (a + b ? `${Math.round((a / (a + b)) * 100)} %` : "–");

// Alle Nutzer (anonym): Wie gut passen die Vorschläge? Datenquelle: Geschmacks-Check, Duell, Bewertungen
export default function UsersArea({ userId }: { userId: string }) {
  return (
    <>
      <Link href="/admin?bereich=ki" className="caption">‹ Zurück zur KI</Link>
      <h2 style={{ marginTop: 10 }}>Alle Nutzer</h2>
      <p className="caption" style={{ marginTop: 0 }}>
        Anonym – du siehst nur Zahlen, keine Namen und keine einzelnen Filme. Neue Nutzer liefern Daten über den Einstieg
        und den Geschmacks-Check.
      </p>
      <Suspense fallback={<p className="caption">Wird berechnet … (pro Nutzer ein paar Sekunden)</p>}>
        <Table userId={userId} />
      </Suspense>
    </>
  );
}

async function Table({ userId }: { userId: string }) {
  const { users } = await userStats(userId);
  if (!users.length) return <p className="caption">Noch keine Daten.</p>;
  const others = users.filter((u) => !u.me);
  const sum = (f: (u: UserStat) => number) => others.reduce((s, u) => s + f(u), 0);
  const aucs = others.map((u) => u.auc).filter((x): x is number => x != null);
  return (
    <>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Freunde zusammen ({others.length})</div>
        <div className="stat-grid">
          <Stat value={pct(sum((u) => u.topYes), sum((u) => u.topNo))} label="Top-Vorschläge passen" hint={`${sum((u) => u.topYes + u.topNo)} Karten im Geschmacks-Check`} />
          <Stat value={pct(sum((u) => u.midYes), sum((u) => u.midNo))} label="Mittelfeld passt" hint="sollte deutlich niedriger sein" />
          <Stat value={aucs.length ? `${Math.round((aucs.reduce((a, b) => a + b, 0) / aucs.length) * 100)} %` : "–"} label="Nachträglicher Test" hint={aucs.length ? `Ø aus ${aucs.length} Nutzern` : "ab 20 Antworten pro Nutzer"} />
          <Stat value={`${others.filter((u) => u.onboarding).length} / ${others.length}`} label="Einstieg gemacht" />
        </div>
      </div>

      <div className="user-table">
        <div className="ut-head"><span /><span>Bew.</span><span>♥</span><span>Antw.</span><span>Top</span><span>Mitte</span><span>Test</span></div>
        {users.map((u) => (
          <div key={u.label} className={`ut-row ${u.me ? "me" : ""}`}>
            <span>{u.label}{!u.onboarding && <span className="caption"> · ohne Einstieg</span>}</span>
            <span>{u.rated}</span>
            <span>{u.favorites}</span>
            <span>{u.answers}</span>
            <span>{pct(u.topYes, u.topNo)}</span>
            <span>{pct(u.midYes, u.midNo)}</span>
            <strong>{u.auc != null ? `${Math.round(u.auc * 100)} %` : "–"}</strong>
          </div>
        ))}
      </div>
      <p className="caption">
        <strong>Top</strong> = Anteil „reizt mich“ bei den Filmen, die die App im Geschmacks-Check für gut passend hielt.
        <strong> Mitte</strong> = dasselbe bei Filmen, bei denen die App unsicher war. Ist Top deutlich höher als Mitte, erkennt die App den Geschmack.
        <strong> Test</strong> = nachträglicher Test der aktuellen App auf allen Antworten dieses Nutzers (50 % = Raten), ab 20 Antworten.
        Top/Mitte zählen erst ab jetzt (ältere Karten waren noch nicht gekennzeichnet).
      </p>
    </>
  );
}

function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div>
      <div className="stat-value">{value}</div>
      <div className="small">{label}</div>
      {hint && <div className="caption">{hint}</div>}
    </div>
  );
}
