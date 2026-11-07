import RateTabs from "@/components/RateTabs";
import CheckPlay from "./CheckPlay";
import { checkCards, checkStatus } from "@/app/check-actions";

// Geschmacks-Check: kurze Runden mit unbekannten Filmen ("Reizt mich" / "Eher nicht")
export default async function CheckPage() {
  const status = await checkStatus();
  const cards = status?.open ? await checkCards() : [];
  return (
    <>
      <RateTabs active="check" />
      {status ? <CheckPlay initialCards={cards} answered={status.answered} />
        : <div className="empty">Der Geschmacks-Check ist noch nicht eingerichtet (Ergänzung 14 fehlt).</div>}
    </>
  );
}
