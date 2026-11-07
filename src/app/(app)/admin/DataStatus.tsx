import RefreshButton from "@/components/RefreshButton";
import WikidataButton from "@/components/WikidataButton";
import { WIKIDATA_VERSION } from "@/lib/wikidata";

// "Datenlage": Wie gut sind die Filme beschrieben – und was fehlt noch für Stufe 2?

export type DataRow = {
  vote_count: number | null; runtime_seconds: number | null; directors: string[] | null; cast_names: string[] | null;
  writers: string[] | null; cinematographers: string[] | null; composers: string[] | null; keywords: string[] | null;
  certification_de: string | null; collection_id: number | null; oscars: string[] | null; globes: string[] | null;
  festivals: string[] | null; canon: string[] | null; based_on: string[] | null; wd_genres: string[] | null;
  narrative_locations: string[] | null; set_in_period: string[] | null; main_subjects: string[] | null;
  wikidata_checked_at: string | null; wikidata_version: number | null;
  black_and_white: boolean | null; budget_usd: number | null; box_office_usd: number | null;
  nominations: string[] | null; filming_locations: string[] | null;
};

const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v != null && v !== "");

function Bar({ label, n, total, hint }: { label: string; n: number; total: number; hint?: string }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="cov">
      <div className="cov-head"><span>{label}</span><span className="caption">{pct} % · {n.toLocaleString("de-DE")}</span></div>
      <div className="progress"><div style={{ width: `${pct}%`, background: pct >= 70 ? "var(--ok)" : pct >= 30 ? "var(--accent)" : "var(--danger)" }} /></div>
      {hint && <div className="caption" style={{ marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function Top({ title, counts, limit = 24 }: { title: string; counts: Map<string, number>; limit?: number }) {
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (!top.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{title}</div>
      <div className="tags">{top.map(([k, n]) => <span key={k} className="tag">{k} · {n}</span>)}</div>
    </div>
  );
}

// Signal-Stichworte: Hinweise auf tiefe Merkmale, die TMDB schon liefert
const SIGNALS: [string, string[]][] = [
  ["Twist (M040)", ["twist ending", "plot twist", "surprise ending"]],
  ["Nichtlinear erzählt (M018)", ["nonlinear timeline", "flashback", "time loop"]],
  ["Antiheld (M034)", ["anti hero", "antihero", "anti-hero"]],
  ["Wahre Geschichte (M027)", ["based on true story", "biography", "based on a true story"]],
  ["Dystopie/Düster (M019/M055)", ["dystopia", "post-apocalyptic future", "neo-noir", "nihilism"]],
  ["Rache (M011)", ["revenge"]],
  ["Übernatürlich (M033)", ["supernatural", "ghost", "demon"]],
  ["Gesellschaftskritik (M030)", ["social commentary", "satire", "class differences", "political satire"]],
];

// Wo stehen wir bei den Merkmalen der Spezifikation (M001–M066)?
const SPEC: { status: "da" | "teil" | "fehlt"; text: string }[] = [
  { status: "da", text: "M001–M010 Grunddaten (Titel, Jahr, Genre, Sprache, Länder, Laufzeit) + FSK" },
  { status: "da", text: "M026 Subgenres (Wikidata-Genres wie Neo-Noir, Heist-Film + Stichworte)" },
  { status: "teil", text: "M011 Zentrale Themen, M032 Politisches – über Stichworte und Wikidata-Hauptthema" },
  { status: "teil", text: "M018 Erzählstruktur, M040 Twist, M034 Protagonistentyp – nur wo Stichworte es zufällig nennen" },
  { status: "teil", text: "M025 Härtegrad (grob über FSK), M027 Realismus (wahre Geschichte), M029 Technologie, M033 Übernatürliches" },
  { status: "teil", text: "M020 Spannung, M023 Humoranteil – nur grob über Genres" },
  { status: "fehlt", text: "M013/M014 Handlungs- & Figurenkomplexität, M015 Moralische Ambivalenz, M016 Figurenentwicklung" },
  { status: "fehlt", text: "M017 Erzähltempo, M019 Grundstimmung, M021 Emotionale Intensität, M022 Nachwirkung" },
  { status: "fehlt", text: "M041–M046 Nachvollziehbarkeit, Informationszurückhaltung, Mehrdeutigkeit, Abschlussgrad, Dialoge, Plausibilität" },
  { status: "fehlt", text: "M024/M047–M051 Bildsprache, Kamera-, Schnittstil, Musik, Sound, Farbe (nur Hinweis: wer Kamera/Musik machte)" },
  { status: "fehlt", text: "M053/M054 Humorarten, M055–M059 Pessimismus, Hoffnung, Trauer, Angst, Romantik, M028 Worldbuilding, M030/M031 Gesellschaftskritik & Philosophie" },
];

export default function DataStatus({ rows, tmdbMissing }: { rows: DataRow[]; tmdbMissing: number }) {
  const total = rows.length;
  const count = (k: keyof DataRow) => rows.filter((r) => has(r[k])).length;
  const wdChecked = rows.filter((r) => (r.wikidata_version ?? 0) >= WIKIDATA_VERSION).length;
  const wdMissing = total - wdChecked;

  const tally = (k: keyof DataRow, skip: (s: string) => boolean = () => false) => {
    const m = new Map<string, number>();
    for (const r of rows) for (const v of (r[k] as string[] | null) ?? []) if (!skip(v)) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  };
  const kw = tally("keywords");
  const signal = (words: string[]) => rows.filter((r) => (r.keywords ?? []).some((k) => words.includes(k.toLowerCase()))).length;
  const GENERIC = new Set(["Filmdrama", "Actionfilm", "Abenteuerfilm", "Filmkomödie", "Kriminalfilm", "Thriller", "Horrorfilm", "Science-Fiction-Film", "Fantasyfilm", "spannender Film", "Monumentalfilm"]);

  return (
    <div>
      <p className="caption" style={{ marginTop: 0 }}>
        {total.toLocaleString("de-DE")} Filme im Katalog. Grün = gut abgedeckt (ab 70 %), Orange = teilweise, Rot = kaum.
      </p>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Daten nachladen</div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <p className="caption" style={{ marginTop: 0 }}>TMDB: Stichworte, Drehbuch, Kamera, Musik, FSK, Bewertungen – fehlt bei {tmdbMissing} Filmen.</p>
            {tmdbMissing > 0 ? <RefreshButton missing={tmdbMissing} label="TMDB-Daten laden" /> : <p className="success">Alles geladen.</p>}
          </div>
          <div>
            <p className="caption" style={{ marginTop: 0 }}>Wikidata: basiert auf, Handlungsort, Zeit, Hauptthema, feine Genres, Schwarzweiß, Budget, Einspielergebnis, Nominierungen, Drehorte – noch nicht (neu) geprüft: {wdMissing} Filme.</p>
            {wdMissing > 0 ? <WikidataButton missing={wdMissing} /> : <p className="success">Alles geprüft.</p>}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>TMDB</div>
        <div className="cov-grid">
          <Bar label="Bewertung & Stimmen" n={count("vote_count")} total={total} />
          <Bar label="Laufzeit" n={count("runtime_seconds")} total={total} />
          <Bar label="Regie" n={count("directors")} total={total} />
          <Bar label="Besetzung" n={count("cast_names")} total={total} />
          <Bar label="Drehbuch" n={count("writers")} total={total} />
          <Bar label="Kamera" n={count("cinematographers")} total={total} />
          <Bar label="Filmmusik" n={count("composers")} total={total} />
          <Bar label="Stichworte" n={count("keywords")} total={total} />
          <Bar label="FSK" n={count("certification_de")} total={total} />
          <Bar label="Teil einer Filmreihe" n={count("collection_id")} total={total} hint="Kein Mangel – nicht jeder Film gehört zu einer Reihe." />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Wikidata {wdChecked < total && <span className="caption">(erst {wdChecked} von {total} geprüft)</span>}</div>
        <div className="cov-grid">
          <Bar label="Feine Genres" n={count("wd_genres")} total={total} />
          <Bar label="Basiert auf …" n={count("based_on")} total={total} hint="Nur Filme mit Vorlage (Buch, Comic, wahre Person …)." />
          <Bar label="Handlungsort" n={count("narrative_locations")} total={total} />
          <Bar label="Zeit der Handlung" n={count("set_in_period")} total={total} />
          <Bar label="Hauptthema" n={count("main_subjects")} total={total} />
          <Bar label="Farbe bekannt" n={count("black_and_white")} total={total} hint={`Davon Schwarzweiß: ${rows.filter((r) => r.black_and_white).length}`} />
          <Bar label="Budget" n={count("budget_usd")} total={total} />
          <Bar label="Einspielergebnis" n={count("box_office_usd")} total={total} />
          <Bar label="Nominierungen" n={count("nominations")} total={total} hint="Filme ohne Nominierung sind kein Mangel." />
          <Bar label="Drehorte" n={count("filming_locations")} total={total} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Auszeichnungen & Listen</div>
        <div className="cov-grid">
          <Bar label="Oscar / Golden Globe" n={rows.filter((r) => has(r.oscars) || has(r.globes)).length} total={total} />
          <Bar label="Festival / BAFTA" n={count("festivals")} total={total} />
          <Bar label="Kritiker-Kanon" n={count("canon")} total={total} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Hinweise auf tiefe Merkmale (aus TMDB-Stichworten)</div>
        <p className="caption" style={{ marginTop: 0 }}>
          So viele Filme tragen ein passendes Stichwort. Wichtig: Fehlt das Stichwort, heißt das nicht „nein“, sondern „unbekannt“ –
          deshalb reichen Stichworte für diese Merkmale nicht aus.
        </p>
        <div className="cov-grid">
          {SIGNALS.map(([label, words]) => <Bar key={label} label={label} n={signal(words)} total={total} />)}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Merkmale der Spezifikation – Stand</div>
        <ul className="spec-list">
          {SPEC.map((x) => (
            <li key={x.text} className={x.status}>
              <span className="spec-dot">{x.status === "da" ? "✓" : x.status === "teil" ? "◐" : "○"}</span>{x.text}
            </li>
          ))}
        </ul>
        <p className="caption">○ = nur mit Stufe 2 (KI-Einschätzung) zuverlässig erfassbar.</p>
      </div>

      <div className="panel">
        <Top title="Häufigste Stichworte" counts={kw} limit={40} />
        <Top title="Häufigste feine Genres (Wikidata)" counts={tally("wd_genres", (g) => GENERIC.has(g))} />
        <Top title="Häufigste Themen (Wikidata)" counts={tally("main_subjects")} />
        <Top title="Häufigste Zeiten der Handlung" counts={tally("set_in_period")} limit={16} />
        <Top title="Häufigste Handlungsorte" counts={tally("narrative_locations")} limit={16} />
        <Top title="Häufigste Drehorte" counts={tally("filming_locations")} limit={16} />
        <Top title="Häufigste Nominierungen" counts={tally("nominations")} limit={20} />
      </div>
    </div>
  );
}
