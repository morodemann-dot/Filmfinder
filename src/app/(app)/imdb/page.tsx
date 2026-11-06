import ImdbImport from "./ImdbImport";

// Jeder darf hier seine eigenen IMDb-Bewertungen importieren.
export const maxDuration = 60;

export default function ImdbPage() {
  return (
    <>
      <h1>IMDb-Bewertungen importieren</h1>
      <p className="muted">
        Übernimmt deine bei IMDb bewerteten Filme samt Bewertung. IMDb 1–10 entspricht hier ½–5 Sternen
        (z. B. IMDb 8 = 4 Sterne). Filme, die du hier in der App schon mit Sternen bewertet hast, bleiben unverändert.
        Serien werden vorerst übersprungen.
      </p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>So bekommst du die Datei</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 1.6, margin: 0 }}>
          <li>Am Computer bei imdb.com anmelden und deine <strong>Bewertungen</strong> öffnen (Profil → „Bewertungen“).</li>
          <li>Oben rechts auf die <strong>drei Punkte „⋮“</strong> → <strong>„Exportieren“</strong>.</li>
          <li>IMDb bereitet die Datei vor. Unter <strong>imdb.com/exports</strong> erscheint sie nach kurzer Zeit → herunterladen.</li>
          <li>Die Datei (endet auf <code>.csv</code>) unten auswählen.</li>
        </ol>
      </div>

      <ImdbImport />
    </>
  );
}
