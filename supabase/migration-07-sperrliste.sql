-- Ergänzung 7: Sperrliste für bewusst entfernte Filme. Einmal im Supabase "SQL Editor" ausführen.
create table if not exists public.excluded_titles (
  media_type  text not null,
  tmdb_id     integer not null,
  title       text,
  excluded_at timestamptz not null default now(),
  primary key (media_type, tmdb_id)
);
alter table public.excluded_titles enable row level security;
notify pgrst, 'reload schema';
