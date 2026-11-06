"use client";

import { useState } from "react";
import { ActorForm, AwardsForm, DirectorForm, FranchiseForm, HollywoodForm, MaintenanceForms } from "./ImportForm";

// "Hinzufügen": oben auswählen, was man hinzufügen möchte – darunter nur das passende Formular.
const OPTIONS = {
  hollywood: { label: "Hollywood nach Jahrzehnt", Form: HollywoodForm },
  preise: { label: "Oscar- & Golden-Globe-Gewinner", Form: AwardsForm },
  franchise: { label: "Franchise (z. B. Star Wars)", Form: FranchiseForm },
  regie: { label: "Regisseur:in", Form: DirectorForm },
  schauspiel: { label: "Schauspieler:in", Form: ActorForm },
  pflege: { label: "Reihen vervollständigen & auffrischen", Form: MaintenanceForms },
} as const;

export default function AddPanel() {
  const [choice, setChoice] = useState<keyof typeof OPTIONS>("hollywood");
  const { Form } = OPTIONS[choice];
  return (
    <>
      <div className="field">
        <label htmlFor="what">Was möchtest du hinzufügen?</label>
        <select id="what" className="select" value={choice} onChange={(e) => setChoice(e.target.value as keyof typeof OPTIONS)}>
          {Object.entries(OPTIONS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
        </select>
      </div>
      <Form />
    </>
  );
}
