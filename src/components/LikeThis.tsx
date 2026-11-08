"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Poster from "./Poster";
import { searchCatalog, type LikeHit } from "@/app/like-actions";

// "Etwas wie …": bis zu 3 Vorbild-Filme wählen – der Stapel zeigt dann Filme, die im Filmnetz nah dran sind
// und zu deinem Geschmack passen.
export default function LikeThis({ seeds }: { seeds: { id: number; title: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<LikeHit[]>([]);
  const last = useRef(0);

  function go(ids: number[]) {
    const p = new URLSearchParams(sp.toString());
    if (ids.length) p.set("wie", ids.join(",")); else p.delete("wie");
    const s = p.toString();
    start(() => router.push(s ? `/?${s}` : "/", { scroll: false }));
  }

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const n = ++last.current;
    const t = setTimeout(async () => { const r = await searchCatalog(term); if (n === last.current) setHits(r); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const ids = seeds.map((s) => s.id);
  const pick = (h: LikeHit) => { setOpen(false); setQ(""); setHits([]); go([...ids, h.id].slice(0, 3)); };
  // Enter: sofort suchen und den ersten Treffer nehmen
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    const r = hits.length ? hits : await searchCatalog(term);
    const first = r.find((h) => !ids.includes(h.id));
    if (first) pick(first); else setHits(r);
  }
  return (
    <div className={`like-this ${pending ? "is-pending" : ""}`}>
      {seeds.length === 0 ? (
        <button className="pill like-open" onClick={() => setOpen(true)}>＋ Etwas wie …</button>
      ) : (
        <div className="like-seeds">
          <span className="caption">Etwas wie</span>
          {seeds.map((s) => (
            <span key={s.id} className="pill on like-seed">
              {s.title}
              <button aria-label={`${s.title} entfernen`} onClick={() => go(ids.filter((x) => x !== s.id))}>✕</button>
            </span>
          ))}
          {seeds.length < 3 && <button className="pill like-open" onClick={() => setOpen(true)}>＋</button>}
        </div>
      )}

      {open && createPortal(
        <div className="onb-sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="like-sheet" role="dialog" aria-label="Etwas wie …">
            <div className="eyebrow">Etwas wie …</div>
            <p className="caption" style={{ margin: "2px 0 10px" }}>
              Wähle einen Film (bis zu 3). Du bekommst Filme, die ihm im Filmnetz ähneln – passend zu deinem Geschmack.
            </p>
            <form onSubmit={submit} className="like-form">
              <input className="input" type="search" autoFocus enterKeyHint="search" autoComplete="off" placeholder="z. B. Zodiac"
                value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn primary" type="submit" disabled={q.trim().length < 2}>Los</button>
            </form>
            {q.trim().length >= 2 && hits.length > 0 && (
              <ul className="onb-hits" style={{ marginTop: 8 }}>
                {hits.map((h) => (
                  <li key={h.id}>
                    <button disabled={ids.includes(h.id)} onClick={() => pick(h)}>
                      <span className="onb-hit-poster"><Poster path={h.poster_path} title={h.title} size="w185" /></span>
                      <span className="onb-hit-text"><strong>{h.title}</strong><span className="caption">{h.year ?? ""}</span></span>
                      <span className="onb-hit-add" aria-hidden>{ids.includes(h.id) ? "✓" : "＋"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button className="linkish" style={{ marginTop: 10 }} onClick={() => setOpen(false)}>Abbrechen</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
