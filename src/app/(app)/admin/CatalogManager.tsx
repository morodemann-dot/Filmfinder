"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Poster from "@/components/Poster";
import { deleteTitles } from "@/app/actions";
import { excludedOrigin } from "@/lib/origin";

export type ManageTitle = {
  id: number;
  tmdb_id: number;
  imdb_id: string | null;
  original_title: string | null;
  original_language: string | null;
  countries: string[] | null;
  globes: string[] | null;
  runtime_seconds: number | null;
  title: string;
  release_year: number | null;
  media_type: string;
  poster_path: string | null;
  created_at: string;
  oscars: string[] | null;
};

const SORTS = { neu: "Zuletzt hinzugefügt", titel: "Titel A–Z", jahr: "Erscheinungsjahr" } as const;

// Alle Titel im Katalog: suchen, auswählen, entfernen.
export default function CatalogManager({ titles }: { titles: ManageTitle[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<keyof typeof SORTS>("neu");
  const [kind, setKind] = useState<"alle" | "movie" | "tv">("alle");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [block, setBlock] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [onlyOrigin, setOnlyOrigin] = useState(false);
  const [onlyShort, setOnlyShort] = useState(false);

  // Kurzfilme / Musikvideos: unter 45 Minuten oder ohne Laufzeitangabe (nur Filme, nicht Serien)
  const shortIds = useMemo(
    () => new Set(titles.filter((t) => t.media_type === "movie" && (!t.runtime_seconds || t.runtime_seconds < 45 * 60)).map((t) => t.id)),
    [titles],
  );

  // Chinesische, russische, indische Produktionen (Preisträger ausgenommen)
  const originReason = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of titles) {
      const awarded = (t.oscars?.length ?? 0) + (t.globes?.length ?? 0) > 0;
      const r = awarded ? null : excludedOrigin(t);
      if (r) m.set(t.id, r);
    }
    return m;
  }, [titles]);

  // Mögliche Duplikate: gleiche IMDb-ID, oder gleicher (Original-)Titel im gleichen/nächsten Jahr
  const dupeIds = useMemo(() => {
    const norm = (t: string | null) => (t ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
    const groups = new Map<string, number[]>();
    const add = (k: string, id: number) => groups.set(k, [...(groups.get(k) ?? []), id]);
    for (const t of titles) {
      if (t.imdb_id) add(`imdb:${t.imdb_id}`, t.id);
      const y = t.release_year ?? 0;
      for (const name of new Set([norm(t.title), norm(t.original_title)])) {
        if (!name) continue;
        add(`t:${t.media_type}:${name}:${y}`, t.id);
        add(`t:${t.media_type}:${name}:${y + 1}`, t.id); // ±1 Jahr (unterschiedliche Startdaten)
      }
    }
    const ids = new Set<number>();
    for (const g of groups.values()) {
      const uniq = [...new Set(g)];
      if (uniq.length > 1) uniq.forEach((id) => ids.add(id));
    }
    return ids;
  }, [titles]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = titles.filter(
      (t) => (kind === "alle" || t.media_type === kind) && (!q || t.title.toLowerCase().includes(q) || String(t.release_year) === q) &&
        (!onlyDupes || dupeIds.has(t.id)) && (!onlyOrigin || originReason.has(t.id)) && (!onlyShort || shortIds.has(t.id)),
    );
    if (sort === "titel" || onlyDupes) list.sort((a, b) => a.title.localeCompare(b.title, "de") || (a.release_year ?? 0) - (b.release_year ?? 0));
    else if (sort === "jahr") list.sort((a, b) => (b.release_year ?? 0) - (a.release_year ?? 0));
    else list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return list;
  }, [titles, query, sort, kind, onlyDupes, dupeIds, onlyOrigin, originReason, onlyShort, shortIds]);

  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));

  function toggle(id: number) {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((t) => next.delete(t.id));
      else visible.forEach((t) => next.add(t.id));
      return next;
    });
  }

  function remove(ids: number[]) {
    setError(null);
    setMessage(null);
    start(async () => {
      try {
        const r = await deleteTitles(ids, block);
        setMessage(`${r.deleted} ${r.deleted === 1 ? "Titel" : "Titel"} entfernt${block ? " und gesperrt" : ""}.`);
        setSelected(new Set());
        setConfirming(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <>
      <div className="sticky-bar">
        <input
          className="input"
          type="search"
          placeholder={`In ${titles.length} Titeln suchen …`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="toolbar" style={{ margin: 0 }}>
          <label className="pill">
            {SORTS[sort]}
            <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} aria-label="Sortierung">
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="pill">
            {kind === "alle" ? "Filme & Serien" : kind === "movie" ? "Nur Filme" : "Nur Serien"}
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Art">
              <option value="alle">Filme & Serien</option>
              <option value="movie">Nur Filme</option>
              <option value="tv">Nur Serien</option>
            </select>
          </label>
          <button className={`pill ${onlyShort ? "on" : ""}`} onClick={() => { setOnlyShort((d) => !d); setOnlyOrigin(false); setOnlyDupes(false); setSelected(new Set()); }}>
            Kurzfilme {shortIds.size > 0 && <span className="count">{shortIds.size}</span>}
          </button>
          <button className={`pill ${onlyOrigin ? "on" : ""}`} onClick={() => { setOnlyOrigin((d) => !d); setOnlyDupes(false); setOnlyShort(false); setSelected(new Set()); }}>
            Ausgeschl. Herkunft {originReason.size > 0 && <span className="count">{originReason.size}</span>}
          </button>
          <button className={`pill ${onlyDupes ? "on" : ""}`} onClick={() => { setOnlyDupes((d) => !d); setOnlyOrigin(false); setOnlyShort(false); setSelected(new Set()); }}>
            Mögliche Duplikate {dupeIds.size > 0 && <span className="count">{dupeIds.size}</span>}
          </button>
          <button className="pill" onClick={toggleAllVisible}>
            {allVisibleSelected ? "Auswahl aufheben" : `Alle ${visible.length} auswählen`}
          </button>
        </div>

        {selected.size > 0 && (
          <div className="panel" style={{ padding: 12, display: "grid", gap: 10 }}>
            <label className="row small">
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
              Nicht erneut importieren (auf Sperrliste setzen)
            </label>
            {!confirming ? (
              <button className="btn danger" onClick={() => setConfirming(true)} disabled={pending}>
                {selected.size} {selected.size === 1 ? "Titel" : "Titel"} entfernen
              </button>
            ) : (
              <div className="row">
                <button className="btn danger" onClick={() => remove([...selected])} disabled={pending}>
                  {pending ? "Entferne …" : `Ja, ${selected.size} endgültig entfernen`}
                </button>
                <button className="btn" onClick={() => setConfirming(false)} disabled={pending}>Abbrechen</button>
              </div>
            )}
            <div className="caption">Bewertungen zu diesen Titeln werden bei allen Nutzern mit entfernt.</div>
          </div>
        )}
        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      {onlyShort && (
        <p className="caption">
          {shortIds.size === 0
            ? "Keine Kurzfilme im Katalog. 👍"
            : "Filme unter 45 Minuten oder ohne Laufzeitangabe (oft Kurzfilme oder Musikvideos). Tipp: „Alle auswählen“ → entfernen."}
        </p>
      )}
      {onlyOrigin && (
        <p className="caption">
          {originReason.size === 0
            ? "Keine Filme mit ausgeschlossener Herkunft im Katalog. 👍"
            : "Nach Originalsprache bzw. ausschließlicher Herkunft (Preisträger ausgenommen). Tipp: „Alle auswählen“ → entfernen."}
        </p>
      )}
      {onlyDupes && (
        <p className="caption">
          {dupeIds.size === 0
            ? "Keine möglichen Duplikate gefunden. 👍"
            : "Gleiche IMDb-ID oder gleicher Titel im selben Jahr. Prüfe kurz (z. B. Remakes haben andere Jahre) und entferne den überzähligen Eintrag mit ✕ – am besten ohne Sperrliste."}
        </p>
      )}
      <div className="caption" style={{ marginBottom: 8 }}>
        {visible.length} Titel{selected.size > 0 && ` · ${selected.size} ausgewählt`}
      </div>

      <div className="manage-list">
        {visible.slice(0, limit).map((t) => (
          <div key={t.id} className="manage-item">
            <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`${t.title} auswählen`} />
            <Poster path={t.poster_path} title="" size="w185" />
            <a href={`/titel/${t.id}`} style={{ minWidth: 0 }}>
              <div className="manage-title">{t.title}</div>
              <div className="caption">
                {[t.media_type === "tv" ? "Serie" : "Film", t.release_year, (t.oscars?.length ?? 0) > 0 ? `🏆 ${t.oscars!.length}` : null, onlyOrigin ? originReason.get(t.id) : null,
                  onlyShort ? (t.runtime_seconds ? `${Math.round(t.runtime_seconds / 60)} Min.` : "Laufzeit unbekannt") : null]
                  .filter(Boolean).join(" · ")}
              </div>
            </a>
            <button className="icon-btn" title="Entfernen" aria-label={`${t.title} entfernen`}
              onClick={() => { setSelected(new Set([t.id])); setConfirming(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              ✕
            </button>
          </div>
        ))}
      </div>
      {visible.length > limit && (
        <div className="pager">
          <button className="btn" onClick={() => setLimit((l) => l + 300)}>Weitere {Math.min(300, visible.length - limit)} anzeigen</button>
        </div>
      )}
    </>
  );
}
