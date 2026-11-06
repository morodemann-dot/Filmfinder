"use client";

import { useState } from "react";
import { ActorForm, AwardsForm, DirectorForm, FranchiseForm, HollywoodForm, MaintenanceForms } from "./ImportForm";
import { BestForm, ListForm, SimilarForm } from "./SourceForms";

// "Hinzufügen": oben auswählen, was man hinzufügen möchte – darunter nur das passende Formular.
const OPTIONS = {
  beste: { label: "Die Besten nach Genre, Jahrzehnt, Thema oder Studio", Form: BestForm },
  aehnlich: { label: "Ähnlich zu euren Lieblingsfilmen", Form: SimilarForm },
  festivals: { label: "Festival- & BAFTA-Gewinner", Form: () => <ListForm list="festivals" /> },
  kanon: { label: "Kritiker-Kanon (Criterion, National Film Registry)", Form: () => <ListForm list="canon" /> },
  preise: { label: "Oscar- & Golden-Globe-Gewinner", Form: AwardsForm },
  hollywood: { label: "Hollywood nach Jahrzehnt", Form: HollywoodForm },
  franchise: { label: "Franchise (z. B. Star Wars)", Form: FranchiseForm },
  regie: { label: "Regisseur:in", Form: DirectorForm },
  schauspiel: { label: "Schauspieler:in", Form: ActorForm },
  pflege: { label: "Reihen vervollständigen & Daten auffrischen", Form: MaintenanceForms },
} as const;

export default function AddPanel() {
  const [choice, setChoice] = useState<keyof typeof OPTIONS>("beste");
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
