-- Ergänzung 17: TMDB-Empfehlungen ("Wer X mochte, mochte auch …"). Einmal im Supabase "SQL Editor" ausführen.
alter table public.titles add column if not exists tmdb_recs integer[];          -- TMDB-IDs der empfohlenen Filme (beste zuerst)
alter table public.titles add column if not exists recs_checked_at timestamptz;  -- wann zuletzt abgeholt
notify pgrst, 'reload schema';
