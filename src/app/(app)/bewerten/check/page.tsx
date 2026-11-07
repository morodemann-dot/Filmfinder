import Link from "next/link";
import CheckPlay from "./CheckPlay";
import { checkCards, checkStatus } from "@/app/check-actions";

// Geschmacks-Check: kurze Runden mit unbekannten Filmen ("Reizt mich" / "Eher nicht")
export default async function CheckPage() {
  const status = await checkStatus();
  const cards = status?.open ? await checkCards() : [];
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 className="page-title-compact">Geschmacks-Check</h1>
        <Link href="/bewerten" className="caption">Bewerten ›</Link>
      </div>
      {status ? <CheckPlay initialCards={cards} answered={status.answered} />
        : <div className="empty">Der Geschmacks-Check ist noch nicht eingerichtet (Ergänzung 14 fehlt).</div>}
    </>
  );
}
