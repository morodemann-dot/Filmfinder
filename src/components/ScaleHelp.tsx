import { SCORE_LABEL, scoreColor } from "./Score";

// "So bewertest du": die Punkte-Skala als farbige Leiste + was die anderen Antworten bedeuten
const GROUPS: { from: number; to: number; text: string }[] = [
  { from: 9, to: 10, text: "Top – würde ich jedem empfehlen" },
  { from: 8, to: 8, text: "Sehr gut" },
  { from: 7, to: 7, text: "Gut & unterhaltsam" },
  { from: 6, to: 6, text: "Ganz okay, nur noch gut" },
  { from: 5, to: 5, text: "Okay" },
  { from: 1, to: 4, text: "Schlecht" },
];

export default function ScaleHelp() {
  return (
    <div className="scale">
      <div className="scale-bar" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <span key={n} style={{ background: scoreColor(n) }}>{n}</span>
        ))}
      </div>
      <ul className="scale-list">
        {GROUPS.map((g) => (
          <li key={g.from}>
            <span className="scale-num" style={{ color: scoreColor(g.to) }}>{g.from === g.to ? g.from : `${g.from}–${g.to}`}</span>
            <span>{g.text}{g.from === g.to ? "" : ` (${g.from}: ${SCORE_LABEL[g.from]}, ${g.to}: ${SCORE_LABEL[g.to]})`}</span>
          </li>
        ))}
      </ul>
      <ul className="scale-list other">
        <li><span className="scale-num">♥</span><span><strong>Lieblingsfilm</strong> – unabhängig von den Punkten: ein Film, den du liebst und immer wieder schaust. Zählt für die App besonders stark.</span></li>
        <li><span className="scale-num">»</span><span><strong>Nicht gesehen</strong> – kommt beim Bewerten nicht wieder, ändert deine Vorschläge nicht.</span></li>
        <li><span className="scale-num">+</span><span><strong>Merkliste</strong> – willst du sehen; leichtes Plus für ähnliche Filme.</span></li>
        <li><span className="scale-num">✕</span><span><strong>Kein Interesse</strong> – nichts für dich; ähnliche Filme rücken nach hinten.</span></li>
      </ul>
    </div>
  );
}
