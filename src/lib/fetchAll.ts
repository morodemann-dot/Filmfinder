// Supabase liefert pro Anfrage höchstens 1000 Zeilen. Diese Hilfe holt alles in Etappen.
export async function fetchAll<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>,
  max = 10000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Wie fetchAll, aber alle Etappen gleichzeitig (schneller bei großen Tabellen).
// count: vorher ermittelte Anzahl Zeilen
export async function fetchAllParallel<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>,
  count: number,
): Promise<T[]> {
  const starts = Array.from({ length: Math.max(1, Math.ceil(count / 1000)) }, (_, i) => i * 1000);
  const parts = await Promise.all(starts.map(async (from) => {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  }));
  return parts.flat();
}
