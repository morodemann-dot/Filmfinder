// Welche Filme hast du wahrscheinlich schon gesehen?
// Wird beim "Bewerten" genutzt, damit du möglichst viele Filme hintereinander bewerten kannst.
//
// Einfach erklärt: Ein Film rückt nach vorn, wenn
// - er zu einer Filmreihe gehört, von der du schon Teile gesehen hast (stärkstes Signal),
// - er von einer Regie stammt, deren Filme du kennst,
// - Schauspieler mitspielen, die du oft siehst,
// - er sehr bekannt ist (bekannte Filme hat man öfter gesehen).

export type RateCandidate = {
  id: number;
  title: string;
  poster_path: string | null;
  release_year: number | null;
  format: string | null;
  genres: string[];
  directors: string[] | null;
  cast_names: string[] | null;
  collection_id: number | null;
  collection_name: string | null;
  popularity: number | null;
};

export type SeenTitle = Pick<RateCandidate, "directors" | "cast_names" | "collection_id">;

export function rankLikelySeen(candidates: RateCandidate[], seen: SeenTitle[]) {
  const collections = new Set<number>();
  const directors = new Map<string, number>();
  const cast = new Map<string, number>();
  for (const s of seen) {
    if (s.collection_id) collections.add(s.collection_id);
    for (const d of s.directors ?? []) directors.set(d, (directors.get(d) ?? 0) + 1);
    for (const a of (s.cast_names ?? []).slice(0, 5)) cast.set(a, (cast.get(a) ?? 0) + 1);
  }
  const maxPop = Math.max(1, ...candidates.map((c) => Math.log10(1 + (c.popularity ?? 0))));

  return candidates
    .map((c) => {
      let score = Math.log10(1 + (c.popularity ?? 0)) / maxPop; // 0–1
      if (c.collection_id && collections.has(c.collection_id)) score += 3;
      const dHits = (c.directors ?? []).reduce((n, d) => n + Math.min(2, directors.get(d) ?? 0), 0);
      score += Math.min(2, dHits) * 0.6;
      const aHits = (c.cast_names ?? []).slice(0, 5).reduce((n, a) => n + Math.min(2, cast.get(a) ?? 0), 0);
      score += Math.min(4, aHits) * 0.2;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}

// Nach "gesehen": verwandte Filme aus dem Rest der Warteschlange direkt dahinter einreihen.
// Zuerst gleiche Filmreihe (in Erscheinungsreihenfolge), dann gleiche Regie (max. 3).
export function pullRelated(queue: RateCandidate[], from: number, seen: RateCandidate) {
  const before = queue.slice(0, from);
  const rest = queue.slice(from);
  const sameCollection = seen.collection_id
    ? rest
        .filter((c) => c.collection_id === seen.collection_id)
        .sort((a, b) => (a.release_year ?? 0) - (b.release_year ?? 0))
    : [];
  const taken = new Set(sameCollection.map((c) => c.id));
  const sameDirector = rest
    .filter((c) => !taken.has(c.id) && (c.directors ?? []).some((d) => (seen.directors ?? []).includes(d)))
    .slice(0, 3);
  sameDirector.forEach((c) => taken.add(c.id));
  const related = [...sameCollection, ...sameDirector];
  return {
    queue: [...before, ...related, ...rest.filter((c) => !taken.has(c.id))],
    relatedIds: related.map((c) => c.id),
  };
}
