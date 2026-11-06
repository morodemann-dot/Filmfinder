-- Ergänzung 2: Regie und Studios speichern.
-- Einmal im Supabase "SQL Editor" ausführen.
alter table public.titles add column if not exists directors text[] not null default '{}';
alter table public.titles add column if not exists studios   text[] not null default '{}';
