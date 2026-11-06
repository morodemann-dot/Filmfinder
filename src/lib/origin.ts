// Herkunfts-Regel: chinesische, russische und indische Produktionen nicht in den Katalog aufnehmen.
// Ein Film gilt als betroffen, wenn
//  - seine Originalsprache Chinesisch, Russisch oder eine indische Sprache ist, ODER
//  - er ausschließlich aus China, Hongkong, Russland/Sowjetunion oder Indien stammt.
// So bleiben z. B. englischsprachige US-Koproduktionen mit China drin.

const LANGS: Record<string, string> = {
  zh: "Chinesisch", cn: "Chinesisch (Kantonesisch)",
  ru: "Russisch",
  hi: "Indisch (Hindi)", ta: "Indisch (Tamil)", te: "Indisch (Telugu)", ml: "Indisch (Malayalam)",
  kn: "Indisch (Kannada)", bn: "Indisch (Bengali)", mr: "Indisch (Marathi)", pa: "Indisch (Punjabi)",
};
const COUNTRIES: Record<string, string> = {
  CN: "China", HK: "Hongkong", RU: "Russland", SU: "Sowjetunion", IN: "Indien",
};

export function excludedOrigin(t: { original_language: string | null; countries: string[] | null }): string | null {
  const lang = t.original_language ?? "";
  if (LANGS[lang]) return `Sprache: ${LANGS[lang]}`;
  const c = t.countries ?? [];
  if (c.length > 0 && c.every((x) => COUNTRIES[x])) return `Herkunft: ${c.map((x) => COUNTRIES[x]).join(", ")}`;
  return null;
}
