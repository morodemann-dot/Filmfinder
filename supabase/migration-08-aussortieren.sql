-- Ergänzung 8: "Aussortieren" – merkt sich, welche Titel geprüft und behalten wurden.
-- Einmal im Supabase "SQL Editor" ausführen.
alter table public.titles add column if not exists kept_at timestamptz;
create index if not exists titles_kept_idx on public.titles (kept_at);
notify pgrst, 'reload schema';
