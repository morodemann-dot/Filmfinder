// Herkunfts-Regel: bestimmte Produktionsländer/Sprachen nicht in den Katalog aufnehmen.
// Ein Film gilt als betroffen, wenn
//  - seine Originalsprache in der Liste unten steht, ODER
//  - er ausschließlich aus Ländern der Liste unten stammt.
// So bleiben z. B. englischsprachige US-Koproduktionen drin.
// Preisträger sind ausgenommen (das regeln die Stellen, die diese Funktion benutzen).

const LANGS: Record<string, string> = {
  // China / Taiwan / Hongkong
  zh: "Chinesisch", cn: "Chinesisch (Kantonesisch)",
  // Russland
  ru: "Russisch",
  // Indien
  hi: "Indisch (Hindi)", ta: "Indisch (Tamil)", te: "Indisch (Telugu)", ml: "Indisch (Malayalam)",
  kn: "Indisch (Kannada)", bn: "Indisch (Bengali)", mr: "Indisch (Marathi)", pa: "Indisch (Punjabi)",
  // Pakistan
  ur: "Urdu",
  // Türkei, Iran, arabischer Raum
  tr: "Türkisch", fa: "Persisch", ar: "Arabisch",
  // Zentralasien
  kk: "Kasachisch", uz: "Usbekisch", ky: "Kirgisisch", tg: "Tadschikisch",
  // Nigeria
  yo: "Yoruba", ig: "Igbo", ha: "Hausa",
};

const COUNTRIES: Record<string, string> = {
  CN: "China", HK: "Hongkong", TW: "Taiwan",
  RU: "Russland", SU: "Sowjetunion",
  IN: "Indien", PK: "Pakistan",
  TR: "Türkei", IR: "Iran", IQ: "Irak", SA: "Saudi-Arabien", EG: "Ägypten",
  KZ: "Kasachstan", UZ: "Usbekistan", KG: "Kirgisistan", TJ: "Tadschikistan",
  NG: "Nigeria", GH: "Ghana",
};

export function excludedOrigin(t: { original_language: string | null; countries: string[] | null }): string | null {
  const lang = t.original_language ?? "";
  if (LANGS[lang]) return `Sprache: ${LANGS[lang]}`;
  const c = t.countries ?? [];
  if (c.length > 0 && c.every((x) => COUNTRIES[x])) return `Herkunft: ${c.map((x) => COUNTRIES[x]).join(", ")}`;
  return null;
}
