// Erscheint sofort beim Seitenwechsel, bis die neue Seite fertig ist (statt dass scheinbar nichts passiert).
export default function Loading() {
  return (
    <div className="page-loading" aria-busy="true" aria-live="polite">
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="sk sk-card" />
      <span className="caption">Lädt …</span>
    </div>
  );
}
