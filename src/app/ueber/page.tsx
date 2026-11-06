import Link from "next/link";

// Über-Seite inkl. der von TMDB verlangten Quellenangabe.
export default function AboutPage() {
  return (
    <div className="shell" style={{ maxWidth: 640 }}>
      <Link href="/" className="brand">
        Film<span>finder</span>
      </Link>
      <h1 style={{ marginTop: 20 }}>Über die App</h1>
      <p>
        Filmfinder ist ein privates, nicht-kommerzielles Projekt. Die App soll deinen Film- und
        Seriengeschmack wirklich verstehen und dir helfen, Neues zu entdecken – unabhängig von
        einzelnen Streaming-Anbietern.
      </p>

      <h2>Datenquellen</h2>
      <div className="panel">
        <p style={{ marginTop: 0 }}>
          <strong>The Movie Database (TMDB)</strong> – Titel, Plakate, Beschreibungen und Grunddaten.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
            themoviedb.org
          </a>
        </p>
      </div>

      <h2>Deine Daten</h2>
      <p className="muted">
        Gespeichert werden nur deine E-Mail-Adresse und deine Bewertungen. Sie sind nur für dich
        sichtbar und werden nicht weitergegeben.
      </p>
    </div>
  );
}
