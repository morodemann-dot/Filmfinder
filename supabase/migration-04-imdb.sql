-- Ergänzung 4: IMDb-ID speichern (für den IMDb-Import). Einmal im Supabase "SQL Editor" ausführen.
alter table public.titles add column if not exists imdb_id text;
create index if not exists titles_imdb_idx on public.titles (imdb_id);
