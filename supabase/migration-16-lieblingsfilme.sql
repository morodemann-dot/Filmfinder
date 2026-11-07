-- Ergänzung 16: Lieblingsfilme (♥) – unabhängig von den Punkten. Einmal im Supabase "SQL Editor" ausführen.
alter table public.user_title_feedback add column if not exists favorite boolean not null default false;
notify pgrst, 'reload schema';
