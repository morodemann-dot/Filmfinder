import LoginForms from "./LoginForms";

export default function LoginPage() {
  return (
    <div className="shell" style={{ maxWidth: 420, paddingTop: "12vh" }}>
      <div className="brand" style={{ fontSize: "2rem", textAlign: "center" }}>
        Film<span>finder</span>
      </div>
      <p className="muted" style={{ textAlign: "center", marginBottom: 28 }}>
        Filme und Serien nach deinem echten Geschmack.
      </p>
      <LoginForms />
      <p className="muted small" style={{ textAlign: "center", marginTop: 28 }}>
        <a href="/ueber">Über die App &amp; Datenquellen</a>
      </p>
    </div>
  );
}
