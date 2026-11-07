// Stufe 2: Eine KI (Claude) schätzt "tiefe" Merkmale eines Films ein – Stimmung, Tempo, Komplexität …
// Jeder Film wird nur EINMAL eingeschätzt; das Ergebnis wird gespeichert (Tabelle title_features).
// Als Hilfe bekommt die KI die Handlung aus der englischen Wikipedia (nur gelesen, nicht gespeichert).

export const AI_MODELS = {
  haiku: { id: "claude-haiku-5-5", name: "Haiku 5.5", inPerM: 0.1, outPerM: 0.5 },
  sonnet: { id: "claude-sonnet-5-5", name: "Sonnet 5.5", inPerM: 2, outPerM: 10 },
} as const;
export type AiModelKey = keyof typeof AI_MODELS;

export function costUsd(model: AiModelKey, inTok: number, outTok: number) {
  const m = AI_MODELS[model];
  return (inTok * m.inPerM + outTok * m.outPerM) / 1e6;
}

// ---------------- Die Merkmale ----------------

// Skalen 0–4. "low/high" = Beschriftung für wenig/viel (für die Erklärungen in der App).
export const AI_SCALES = {
  tempo: { spec: "M017", name: "Erzähltempo", desc: "0 = sehr ruhig/bedächtig, 4 = sehr schnell/gehetzt", low: "Ruhiges Tempo", mid: "Mittleres Tempo", high: "Hohes Tempo" },
  komplexitaet: { spec: "M013", name: "Handlungskomplexität", desc: "0 = sehr geradlinig, 4 = sehr verschachtelt, verlangt volle Aufmerksamkeit", low: "Geradlinige Handlung", mid: "Etwas verschachtelt", high: "Komplexe Handlung" },
  spannung: { spec: "M020", name: "Spannung", desc: "0 = kaum Spannung, 4 = durchgehend hochspannend", low: "Wenig Spannung", mid: "Mittlere Spannung", high: "Hochspannend" },
  emotion: { spec: "M021", name: "Emotionale Intensität", desc: "0 = emotional distanziert, 4 = sehr bewegend/aufwühlend", low: "Emotional zurückhaltend", mid: "Emotional mittel", high: "Sehr bewegend" },
  humor: { spec: "M023", name: "Humoranteil", desc: "0 = gar kein Humor, 4 = Humor steht im Mittelpunkt", low: "Kaum Humor", mid: "Etwas Humor", high: "Viel Humor" },
  haerte: { spec: "M025", name: "Härtegrad", desc: "0 = keine explizite Gewalt, 4 = sehr explizite, drastische Gewalt", low: "Kaum Gewalt", mid: "Etwas Gewalt", high: "Sehr hart" },
  ambivalenz: { spec: "M015", name: "Moralische Ambivalenz", desc: "0 = klares Gut gegen Böse, 4 = durchgehend moralische Grauzonen", low: "Klares Gut/Böse", mid: "Etwas Grauzone", high: "Moralische Grauzonen" },
  mehrdeutigkeit: { spec: "M043/M044", name: "Mehrdeutigkeit & offenes Ende", desc: "0 = alles eindeutig aufgelöst, 4 = sehr offen, viel Raum für Deutung", low: "Eindeutiges Ende", mid: "Etwas offen", high: "Offen & mehrdeutig" },
  nachwirkung: { spec: "M022", name: "Nachwirkung / Denkanstoß", desc: "0 = reine Unterhaltung, 4 = beschäftigt einen lange danach", low: "Reine Unterhaltung", mid: "Etwas zum Nachdenken", high: "Wirkt lange nach" },
  realismus: { spec: "M027", name: "Realismus", desc: "0 = völlig fantastisch/überzeichnet, 4 = sehr realistisch und bodenständig", low: "Fantastisch/überzeichnet", mid: "Teils realistisch", high: "Sehr realistisch" },
  worldbuilding: { spec: "M028", name: "Eigene Welt", desc: "0 = spielt in unserer normalen Welt, 4 = aufwendig erfundene eigene Welt", low: "Normale Welt", mid: "Etwas eigene Welt", high: "Aufwendige eigene Welt" },
  twist: { spec: "M040", name: "Wendungen / Twist", desc: "0 = keine Überraschungen, 4 = große Wendung, die alles neu einordnet", low: "Ohne große Wendung", mid: "Einige Wendungen", high: "Starker Twist" },
  romantik: { spec: "M059", name: "Romantik", desc: "0 = keine Romantik, 4 = Liebesgeschichte steht im Mittelpunkt", low: "Kaum Romantik", mid: "Etwas Romantik", high: "Viel Romantik" },
  dialog: { spec: "M045", name: "Dialoglastigkeit", desc: "0 = kaum Dialog, lebt von Bildern/Action, 4 = lebt von Gesprächen", low: "Wenig Dialog", mid: "Ausgewogen", high: "Dialoglastig" },
  duester: { spec: "M019/M055", name: "Düsternis", desc: "0 = hell, optimistisch, 4 = sehr düster, pessimistisch", low: "Hell & optimistisch", mid: "Teils düster", high: "Sehr düster" },
} as const;
export type AiScale = keyof typeof AI_SCALES;

export const MOODS_AI = ["düster", "bedrückend", "melancholisch", "nachdenklich", "ernst", "warm", "hoffnungsvoll", "leicht", "verspielt", "mitreißend", "unheimlich", "absurd"] as const;
export const HUMOR_TYPES = ["schwarz", "trocken", "albern", "satirisch", "situationskomisch", "wortwitz", "romantisch-komisch"] as const;
export const STRUCTURES = ["chronologisch", "nichtlinear", "rückblenden", "mehrere_perspektiven", "zeitschleife", "rahmenhandlung", "episodisch"] as const;

export type AiFeatures = Record<AiScale, number> & {
  stimmung: string[];
  humorarten: string[];
  struktur: string[];
  sicherheit: number; // 0–1: wie gut kennt die KI den Film?
};

const SYSTEM = `Du bist ein erfahrener Filmkritiker. Du schätzt Filme nach festen Merkmalen ein, damit eine App Filme passend zum Geschmack einer Person vorschlagen kann.

Regeln:
- Bewerte den Film so, wie ihn ein aufmerksames Publikum erlebt – nicht seine Qualität.
- Nutze die ganze Skala 0–4. 2 = typischer Durchschnitt aller Spielfilme.
- Stütze dich auf dein Wissen über den Film und die mitgelieferte Handlung. Erfinde nichts.
- Kennst du den Film kaum und fehlt die Handlung, setze "sicherheit" niedrig.

Skalen (0–4):
${Object.entries(AI_SCALES).map(([k, s]) => `- ${k} (${s.name}): ${s.desc}`).join("\n")}

Listen:
- stimmung: 1–3 passende Begriffe für die Grundstimmung
- humorarten: 0–3 Arten von Humor (leer, wenn kaum Humor)
- struktur: 1–2 Begriffe zur Erzählweise`;

const TOOL = {
  name: "film_merkmale",
  description: "Speichert die Einschätzung eines Films.",
  input_schema: {
    type: "object",
    properties: {
      ...Object.fromEntries(
        Object.entries(AI_SCALES).map(([k, s]) => [k, { type: "integer", minimum: 0, maximum: 4, description: s.desc }]),
      ),
      stimmung: { type: "array", items: { type: "string", enum: MOODS_AI }, maxItems: 3 },
      humorarten: { type: "array", items: { type: "string", enum: HUMOR_TYPES }, maxItems: 3 },
      struktur: { type: "array", items: { type: "string", enum: STRUCTURES }, maxItems: 2 },
      sicherheit: { type: "number", minimum: 0, maximum: 1, description: "Wie sicher bist du dir (0–1)?" },
    },
    required: [...Object.keys(AI_SCALES), "stimmung", "humorarten", "struktur", "sicherheit"],
  },
};

export type FilmInput = {
  title: string;
  original_title?: string | null;
  release_year?: number | null;
  directors?: string[] | null;
  cast_names?: string[] | null;
  genres?: string[] | null;
  overview?: string | null;
};

function clean(raw: Record<string, unknown>): AiFeatures {
  const num = (v: unknown) => (v == null || isNaN(Number(v)) ? 2 : Math.max(0, Math.min(4, Math.round(Number(v))))); // fehlt = Durchschnitt
  const list = (v: unknown, allowed: readonly string[]) =>
    (Array.isArray(v) ? v : []).map(String).filter((x) => allowed.includes(x)).slice(0, 3);
  const out = Object.fromEntries(Object.keys(AI_SCALES).map((k) => [k, num(raw[k])])) as Record<AiScale, number>;
  return {
    ...out,
    stimmung: list(raw.stimmung, MOODS_AI),
    humorarten: list(raw.humorarten, HUMOR_TYPES),
    struktur: list(raw.struktur, STRUCTURES),
    sicherheit: Math.max(0, Math.min(1, Number(raw.sicherheit) || 0)),
  };
}

// Lässt einen Film einschätzen. Wirft einen verständlichen Fehler, wenn etwas nicht klappt.
export async function rateFilm(model: AiModelKey, film: FilmInput, plot: string | null) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY fehlt in Vercel (Settings → Environment Variables, danach Redeploy).");
  const info = [
    `Film: ${film.title}${film.original_title && film.original_title !== film.title ? ` (Originaltitel: ${film.original_title})` : ""}${film.release_year ? `, ${film.release_year}` : ""}`,
    film.directors?.length ? `Regie: ${film.directors.join(", ")}` : "",
    film.cast_names?.length ? `Mit: ${film.cast_names.slice(0, 5).join(", ")}` : "",
    film.genres?.length ? `Genres: ${film.genres.join(", ")}` : "",
    film.overview ? `Kurzbeschreibung: ${film.overview}` : "",
    plot ? `Handlung (Wikipedia, englisch):\n${plot}` : "Keine ausführliche Handlung verfügbar.",
  ].filter(Boolean).join("\n");

  // Erst mit festem Antwortformular; manche Modelle (z. B. Sonnet 5.5) erlauben diesen Zwang nicht –
  // dann nur darum bitten und die Antwort notfalls als Text (JSON) auslesen.
  let j = await callApi(key, model, info, !NO_FORCED_TOOL.has(model)).catch(async (e: Error) => {
    if (/tool_choice/.test(e.message)) { NO_FORCED_TOOL.add(model); return callApi(key, model, info, false); }
    throw e;
  });
  let features = extractFeatures(j);
  if (!features) {
    j = await callApi(key, model, info, false);
    features = extractFeatures(j);
  }
  if (!features) throw new Error("Die KI hat keine Einschätzung geliefert.");
  return {
    features,
    inputTokens: Number(j.usage?.input_tokens ?? 0),
    outputTokens: Number(j.usage?.output_tokens ?? 0),
  };
}

// Modelle, die kein erzwungenes Antwortformular erlauben (wird beim ersten Versuch gelernt)
const NO_FORCED_TOOL = new Set<AiModelKey>();

type ApiResponse = { content?: { type: string; input?: Record<string, unknown>; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };

async function callApi(key: string, model: AiModelKey, info: string, forceTool: boolean): Promise<ApiResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: AI_MODELS[model].id,
      max_tokens: forceTool ? 800 : 2500,
      system: forceTool ? SYSTEM : SYSTEM + `\n\nAntworte ausschließlich, indem du das Werkzeug "${TOOL.name}" genau einmal aufrufst.`,
      tools: [TOOL],
      tool_choice: forceTool ? { type: "tool", name: TOOL.name } : { type: "auto" },
      messages: [{ role: "user", content: info }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(50_000), // lieber selbst abbrechen als von Vercel abgeschnitten werden
  }).catch((e) => {
    throw new Error(e?.name === "TimeoutError" ? "Die KI hat zu lange gebraucht (über 50 Sekunden)." : `Keine Verbindung zur KI: ${e?.message ?? e}`);
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = j?.error?.message ?? res.statusText;
    if (res.status === 401) throw new Error("Der API-Schlüssel wird nicht akzeptiert – bitte in Vercel prüfen.");
    if (res.status === 400 && /credit/i.test(msg)) throw new Error("Das Guthaben bei Anthropic ist aufgebraucht.");
    throw new Error(`KI-Fehler ${res.status}: ${msg}`);
  }
  return j as ApiResponse;
}

// Einschätzung aus der Antwort holen: Werkzeug-Aufruf, sonst JSON im Text
function extractFeatures(j: ApiResponse): AiFeatures | null {
  const tool = (j.content ?? []).find((c) => c.type === "tool_use");
  if (tool?.input) return clean(tool.input);
  const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return clean(JSON.parse(m[0])); } catch { return null; }
}

// ---------------- Handlung aus Wikipedia ----------------

const UA = "FilmfinderHobbyProject/0.1 (https://github.com/morodemann-dot/Filmfinder; private, non-commercial)";
const PLOT_MAX = 5000; // Zeichen (~1.200 Tokens) – reicht für eine gute Einschätzung

// Holt den Abschnitt "Plot" des englischen Wikipedia-Artikels (über Wikidata gefunden).
export async function wikipediaPlots(tmdbIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!tmdbIds.length) return out;
  const values = tmdbIds.map((id) => `"${id}"`).join(" ");
  const q = `SELECT ?tmdb ?t WHERE { VALUES ?tmdb { ${values} } ?f wdt:P4947 ?tmdb . ?a schema:about ?f ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?t . }`;
  let rows: { tmdb: { value: string }; t: { value: string } }[] = [];
  try {
    const r = await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(q), {
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
      cache: "no-store",
    });
    if (r.ok) rows = (await r.json()).results.bindings;
  } catch { /* ohne Handlung weitermachen */ }

  await Promise.all(rows.map(async (row) => {
    try {
      const url = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&formatversion=2&redirects=1&titles=" +
        encodeURIComponent(row.t.value);
      const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
      if (!r.ok) return;
      const text: string = (await r.json())?.query?.pages?.[0]?.extract ?? "";
      const plot = extractPlot(text);
      if (plot) out.set(Number(row.tmdb.value), plot);
    } catch { /* einzelner Film ohne Handlung ist kein Problem */ }
  }));
  return out;
}

export function extractPlot(text: string): string | null {
  const m = text.match(/\n==\s*(Plot|Synopsis|Plot summary|Premise|Story)\s*==\n/i);
  if (m && m.index != null) {
    const rest = text.slice(m.index + m[0].length);
    const end = rest.search(/\n==\s*[^=]/);
    const plot = (end >= 0 ? rest.slice(0, end) : rest).replace(/\n===.*===\n/g, "\n").trim();
    if (plot.length > 200) return plot.slice(0, PLOT_MAX);
  }
  // Kein Handlungsabschnitt: Einleitung des Artikels als Notlösung
  const intro = text.split(/\n==/)[0].trim();
  return intro.length > 200 ? intro.slice(0, 2000) : null;
}
