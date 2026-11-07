import TabLink from "./TabLink";

// Umschalter oben auf der Bewerten-Seite: Schnell bewerten | Geschmacks-Check (Glas-Stil wie die Leiste unten)
export default function RateTabs({ active }: { active: "bewerten" | "check" }) {
  return (
    <div className="segmented rate-tabs" role="tablist" aria-label="Bewerten">
      <TabLink href="/bewerten" pressed={active === "bewerten"}>Bewerten</TabLink>
      <TabLink href="/bewerten/check" pressed={active === "check"}>⚡ Geschmacks-Check</TabLink>
    </div>
  );
}
