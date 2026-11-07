import Link from "next/link";
import Poster from "@/components/Poster";
import { MIN_RATINGS } from "@/lib/onboarding";
import PickDeck, { type Pick } from "@/components/PickDeck";
import FinderFilters, { type FinderFilter } from "@/components/FinderFilters";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadSnoozed, loadTasteData } from "@/lib/tasteData";
import { tuneOptions } from "@/lib/evaluate";
import {
  APP_SETTINGS, ASPECT_LABELS, buildProfile, franchiseOf, pickDiverse, recommend, SUGGEST_FROM_YEAR, topInterests, topPreferences,
  type RatedTitle, type Recommendation,
} from "@/lib/recommend";
import { MODES, MOODS, PERIODS, TIMES, matchesMood, matchesTime, type TimeKey } from "@/lib/moods";
import { dayNumber, moreLike } from "@/lib/similar";
import { friendRated, neighborPicks, togetherFriends } from "@/lib/friends";
import { formatRuntime, type Title } from "@/lib/types";

// Startseite "Filmfinder": Filter oben (Auswahlmenüs), darunter der Kartenstapel mit den besten Vorschlägen
// und persönliche Reihen ("Weil du X mochtest", Geheimtipps, Merkliste).

type SP = { stimmung?: string; zeit?: string; modus?: string; genre?: string; zeitraum?: string; mit?: string };

function Tile({ t, caption }: { t: Title; caption?: string }) {
  return (
    <Link href={`/titel/${t.id}`} className="card">
      <Poster path={t.poster_path} title={t.title} size="w185" />
      <div className="card-title">{t.title}</div>
      <div className="card-meta">{caption ?? t.release_year}</div>
    </Link>
  );
}

function Row({ title, sub, items }: { title: string; sub?: string; items: { t: Title; caption?: string }[] }) {
  if (items.length < 3) return null;
  return (
    <section>
      <div className="row-head">
        <h2>{title}</h2>
        {sub && <span className="caption">{sub}</span>}
      </div>
      <div className="row-scroll">{items.map(({ t, caption }) => <Tile key={t.id} t={t} caption={caption} />)}</div>
    </section>
  );
}

const shortReason = (r?: Recommendation) => r?.reasons[0]?.replace(/ \(.*\)$/, "").replace(/^Typisch für dich – /, "");

export default async function FilmfinderPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const mood = MOODS.find((m) => m.key === sp.stimmung) ?? null;
  const time = (sp.zeit && sp.zeit in TIMES ? sp.zeit : "egal") as TimeKey;
  const period = PERIODS[sp.zeitraum ?? ""] ?? PERIODS.alle;
  const mode = sp.modus && sp.modus in MODES ? sp.modus : "entdecken";

  const supabase = await createClient();
  const user = await getUser();
  const [{ rated, catalog }, snoozed, together] = await Promise.all([
    loadTasteData(supabase, user!.id), loadSnoozed(supabase, user!.id), togetherFriends(user!.id),
  ]);
  // Gemeinsam schauen: nur wenn beide es freigegeben haben
  const friendsAvailable = together.me?.share_together ? together.friends : [];
  const mitFriend = friendsAvailable.find((f) => f.id === sp.mit) ?? null;
  // Ausgeblendet: alles schon Eingeordnete + gerade pausierte Filme
  const seen = new Set([...rated.map((r) => r.id), ...snoozed]);
  const tuned = tuneOptions(rated).opts;
  // Interesse (welche ART von Filmen du schaust) + halbe allgemeine Qualität – im Modell-Duell am treffsichersten
  const opts = { ...tuned, ...APP_SETTINGS };
  const profile = buildProfile(rated, opts, catalog);
  const { prefs, ratedCount } = profile;

  if (ratedCount < MIN_RATINGS) {
    return (
      <>
        <h1>Was soll es heute werden?</h1>
        <div className="empty">
          <p>
            Damit die App deinen Geschmack erkennen kann, bewerte bitte mindestens <strong>{MIN_RATINGS} Filme</strong>
            {" "}(bisher: {ratedCount}).
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/bewerten" className="btn primary">Jetzt bewerten</Link>
            <Link href="/imdb" className="btn">IMDb importieren</Link>
          </div>
        </div>
      </>
    );
  }

  // Auswahlmöglichkeiten der Filter
  const recent = catalog.filter((t) => (t.release_year ?? 0) >= SUGGEST_FROM_YEAR);
  const genreCount = new Map<string, number>();
  for (const t of recent) for (const g of t.genres ?? []) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  const filters: FinderFilter[] = [
    { key: "stimmung", label: "Stimmung", all: "Jede Stimmung", options: MOODS.map((m) => ({ value: m.key, label: m.label, group: m.group ?? "Stimmungen" })) },
    { key: "genre", label: "Genre", all: "Alle Genres", options: [...genreCount.entries()].filter(([, n]) => n >= 5).sort((a, b) => a[0].localeCompare(b[0], "de")).map(([g]) => ({ value: g, label: g })) },
    { key: "zeit", label: "Länge", all: "Jede Länge", options: (Object.keys(TIMES) as TimeKey[]).filter((k) => k !== "egal").map((k) => ({ value: k, label: TIMES[k].label })) },
    { key: "zeitraum", label: "Zeitraum", all: "Seit 1980", options: Object.entries(PERIODS).filter(([k]) => k !== "alle").map(([k, p]) => ({ value: k, label: p.label })) },
    { key: "modus", label: "Entdecken", all: "Entdecken", options: Object.entries(MODES).filter(([k]) => k !== "entdecken").map(([k, label]) => ({ value: k, label })) },
  ];
  if (friendsAvailable.length) {
    filters.unshift({ key: "mit", label: "Allein", all: "Allein schauen", options: friendsAvailable.map((f) => ({ value: f.id, label: `Mit ${f.name}` })) });
  }

  // Kandidaten: ungesehen, ab 1990 und passend zu allen Filtern
  const pops = recent.map((t) => t.popularity ?? 0).sort((a, b) => a - b);
  const p40 = pops[Math.floor(pops.length * 0.4)] ?? 0;
  const p60 = pops[Math.floor(pops.length * 0.6)] ?? 0;
  const byMode = (t: Title) =>
    mode === "geheimtipp" ? (t.popularity ?? 0) < p40 && (t.vote_count ?? 0) >= 300
      : mode === "bekannt" ? (t.popularity ?? 0) >= p60
        : mode === "preise" ? (t.oscars?.length ?? 0) + (t.globes?.length ?? 0) + (t.festivals?.length ?? 0) > 0
          : true;
  // Gemeinsam schauen: auch was der Freund schon kennt, fällt raus
  const friend = mitFriend ? await friendRated(mitFriend.id, catalog) : [];
  const friendSeen = new Set(friend.map((r) => r.id));
  const matching = recent.filter(
    (t) => !seen.has(t.id) && !friendSeen.has(t.id) && (t.release_year ?? 0) >= period.from && (t.release_year ?? 0) <= period.to &&
      (!mood || matchesMood(t, mood)) && (!sp.genre || (t.genres ?? []).includes(sp.genre)) && matchesTime(t, time) && byMode(t),
  );
  // Entdecken: Reihen und Universen, aus denen du schon etwas gesehen (oder abgelehnt) hast, kennst du vermutlich –
  // wer Star Wars 7 gesehen hat, kennt 8 und 9. Diese Filme kommen nicht in den Stapel, sondern unten in "Kennst du die schon?".
  const knownFranchises = new Set(
    rated.filter((r) => r.status === "gesehen" || r.status === "nicht_interessiert").map(franchiseOf).filter((x): x is string => !!x),
  );
  const discover = mode === "entdecken";
  const probablyKnown = discover ? matching.filter((t) => { const f = franchiseOf(t); return !!f && knownFranchises.has(f); }) : [];
  const knownSet = new Set(probablyKnown.map((t) => t.id));
  const candidates = matching.filter((t) => !knownSet.has(t.id));
  let recs = recommend(candidates, profile, opts).filter((r) => r.reasons.length > 0);
  if (discover) {
    // Sehr bekannte Filme (oberste 15 % nach Bekanntheit) etwas nach hinten – die hast du eher schon auf dem Schirm
    const rank = new Map([...recent].sort((a, b) => (a.popularity ?? 0) - (b.popularity ?? 0)).map((t, i, arr) => [t.id, i / Math.max(1, arr.length - 1)]));
    recs = recs
      .map((r) => ({ ...r, score: r.score - 0.4 * Math.max(0, ((rank.get(r.title.id) ?? 0) - 0.85) / 0.15) }))
      .sort((a, b) => b.score - a.score);
  }
  if (mitFriend) {
    // Für euch beide: Durchschnitt beider Werte, aber mit Abzug, wenn es nur einem gefällt
    const fOpts = { ...tuneOptions(friend).opts, ...APP_SETTINGS };
    const theirs = new Map(recommend(candidates, buildProfile(friend, fOpts, catalog), fOpts).map((r) => [r.title.id, r.score]));
    recs = recs
      .map((r) => {
        const b = theirs.get(r.title.id) ?? 0;
        return { ...r, score: (r.score + b) / 2 - 0.5 * Math.abs(r.score - b), reasons: [`Passt zu dir und ${mitFriend.name}`, ...r.reasons].slice(0, 3) };
      })
      .sort((a, b) => b.score - a.score);
  }
  const recById = new Map(recs.map((r) => [r.title.id, r]));
  const boost = new Map(recs.map((r) => [r.title.id, r.score]));

  // 1) Der Stapel: die besten Vorschläge, abwechslungsreich
  const DECK = 25;
  const diverse = pickDiverse(recs, DECK + 12);
  const picks: Pick[] = diverse.slice(0, DECK).map((r) => ({
    id: r.title.id,
    title: r.title.title,
    poster_path: r.title.poster_path,
    meta: [r.title.release_year, formatRuntime(r.title.runtime_seconds), r.title.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · "),
    reasons: r.reasons,
    info: {
      directors: r.title.directors, cast_names: r.title.cast_names?.slice(0, 3), genres: r.title.genres, wd_genres: r.title.wd_genres,
      composers: r.title.composers?.slice(0, 1), cinematographers: r.title.cinematographers?.slice(0, 1), based_on: r.title.based_on,
      writers: r.title.writers?.slice(0, 1), keywords: r.title.keywords?.slice(0, 15), main_subjects: r.title.main_subjects,
      set_in_period: r.title.set_in_period, narrative_locations: r.title.narrative_locations, runtime_seconds: r.title.runtime_seconds,
      certification_de: r.title.certification_de, collection_name: r.title.collection_name,
    },
  }));
  const inDeck = new Set(picks.map((p) => p.id));
  const notInDeck = (t: Title) => !inDeck.has(t.id);

  // 2) "Weil du X mochtest" – zwei Lieblingsfilme, die täglich wechseln
  const favorites = rated
    .filter((r): r is RatedTitle => r.status === "gesehen" && (r.rating ?? 0) >= 8 && (r.release_year ?? 0) >= SUGGEST_FROM_YEAR)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.id - b.id);
  const day = dayNumber();
  const anchors = favorites.length
    ? [...new Set([favorites[(day * 7) % favorites.length], favorites[(day * 7 + Math.floor(favorites.length / 2)) % favorites.length]])]
    : [];
  const becauseRows = anchors.map((a) => ({
    anchor: a,
    items: moreLike(a, candidates.filter(notInDeck), boost, 12).map((t) => ({ t, caption: shortReason(recById.get(t.id)) ?? String(t.release_year ?? "") })),
  }));

  // 3) Geheimtipps (wenig bekannt, passt aber zu dir)
  const gems = mode === "geheimtipp" ? [] : pickDiverse(recs.filter((r) => (r.title.popularity ?? 0) < p40 && (r.title.vote_count ?? 0) >= 300 && notInDeck(r.title)), 12);

  // 4) Leute mit ähnlichem Geschmack
  const nb = mitFriend ? { count: 0, picks: [] } : await neighborPicks(user!.id, new Set(candidates.filter(notInDeck).map((t) => t.id)));
  const byId = new Map(candidates.map((t) => [t.id, t]));
  const neighborRow = nb.picks.slice(0, 12).flatMap((p) => {
    const t = byId.get(p.id);
    return t ? [{ t, caption: `${p.n === 1 ? "1 Person" : `${p.n} Leute`} · Ø ${p.avg.toLocaleString("de-DE", { maximumFractionDigits: 1 })}` }] : [];
  });

  // 5) Merkliste, passend zu den Filtern
  const watchlist = rated.filter((r) => r.status === "merkliste" && (!mood || matchesMood(r, mood)) && (!sp.genre || (r.genres ?? []).includes(sp.genre)) && matchesTime(r, time));

  const more = diverse.slice(DECK, DECK + 12);
  const interests = topInterests(profile.interest, 8);
  const learned = topPreferences(prefs, 8);
  // Antworten aus den kurzen Fragen (was dir wichtig ist / was stört)
  const aspectList = [...profile.aspectCounts.entries()].flatMap(([k, c]) => {
    const [pos, neg] = ASPECT_LABELS[k] ?? [k, k];
    return [...(c.pos && pos !== "–" ? [{ label: `Wichtig: ${pos}`, n: c.pos }] : []), ...(c.neg && neg !== "–" ? [{ label: `Stört: ${neg}`, n: c.neg }] : [])];
  }).sort((a, b) => b.n - a.n).slice(0, 8);
  const deckKey = JSON.stringify([sp.stimmung, sp.genre, sp.zeit, sp.zeitraum, sp.modus, sp.mit]);

  return (
    <>
      <h1>{mitFriend ? `Was schaut ihr heute?` : "Was soll es heute werden?"}</h1>
      <p className="caption finder-sub">
        {mitFriend ? `Für dich und ${mitFriend.name} ausgewählt` : "Für dich ausgewählt"} aus {candidates.length.toLocaleString("de-DE")} passenden Filmen · gelernt aus {ratedCount} Bewertungen
      </p>

      <FinderFilters filters={filters} />

      <div style={{ marginTop: 16 }}>
        {picks.length > 0 ? (
          <PickDeck picks={picks} deckKey={deckKey} />
        ) : (
          <div className="empty">Dafür haben wir gerade nichts Passendes im Katalog. Probier einen anderen Filter.</div>
        )}
      </div>

      {becauseRows.map(({ anchor, items }) => (
        <Row key={anchor.id} title={`Weil du „${anchor.title}“ mochtest`} sub={`${anchor.rating}/10`} items={items} />
      ))}
      <Row title="Leute mit ähnlichem Geschmack mochten" sub="aus der App, anonym" items={neighborRow} />
      <Row title="Geheimtipps für dich" sub="wenig bekannt, passt aber" items={gems.map((r) => ({ t: r.title, caption: shortReason(r) }))} />
      <Row title="Kennst du die schon?" sub="aus Reihen, die du kennst – antippen & bewerten"
        items={probablyKnown.sort((a, b) => (a.release_year ?? 0) - (b.release_year ?? 0)).slice(0, 15)
          .map((t) => ({ t, caption: t.collection_name ?? franchiseOf(t)?.replace(/^reihe:\d+$/, "") ?? String(t.release_year ?? "") }))} />
      <Row title="Von deiner Merkliste" items={watchlist.slice(0, 15).map((t) => ({ t, caption: String(t.release_year ?? "") }))} />
      <Row title="Weitere Ideen" items={more.map((r) => ({ t: r.title, caption: shortReason(r) }))} />

      <details className="panel" style={{ marginTop: 28 }}>
        <summary className="eyebrow" style={{ cursor: "pointer" }}>Was die App über dich gelernt hat</summary>
        <p className="caption">
          Am wichtigsten ist, welche Art von Filmen du schaust (Interesse). Dazu kommen die allgemeine Qualität (TMDB-Bewertung)
          und, wo deine Bewertungen ein Muster zeigen, Genre, Regie, Themen und mehr. Basierend auf {ratedCount} Bewertungen.
        </p>
        {interests.length > 0 && (
          <>
            <div className="eyebrow" style={{ margin: "10px 0 8px" }}>Was du besonders oft schaust</div>
            <div className="tags" style={{ marginBottom: 0 }}>
              {interests.map((x) => (
                <span key={x.key} className="tag">{x.label} · {Math.round(x.share * 100)} % (sonst {Math.round(x.catShare * 100)} %)</span>
              ))}
            </div>
          </>
        )}
        {learned.length > 0 && (
          <>
            <div className="eyebrow" style={{ margin: "14px 0 8px" }}>Was du besser bewertest als üblich</div>
            <div className="tags" style={{ marginBottom: 0 }}>
              {learned.map((p) => (
                <span key={p.key} className="tag">
                  {p.label} · {p.n} Filme · Ø {p.avgScore?.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
                </span>
              ))}
            </div>
          </>
        )}
        {aspectList.length > 0 && (
          <>
            <div className="eyebrow" style={{ margin: "14px 0 8px" }}>Aus deinen Antworten</div>
            <div className="tags" style={{ marginBottom: 0 }}>
              {aspectList.map((a) => <span key={a.label} className="tag">{a.label}</span>)}
            </div>
          </>
        )}
        <Link href="/messtest" className="btn" style={{ marginTop: 14 }}>Wie treffsicher sind die Vorschläge? Messtest ›</Link>
      </details>
    </>
  );
}
