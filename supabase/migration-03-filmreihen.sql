-- Ergänzung 3: Filmreihen (Franchises). Einmal im Supabase "SQL Editor" ausführen.
alter table public.titles add column if not exists collection_id   integer;
alter table public.titles add column if not exists collection_name text;
create index if not exists titles_collection_idx on public.titles (collection_id);

create table if not exists public.collections (
  id         integer primary key,
  name       text,
  checked_at timestamptz
);
alter table public.collections enable row level security;
