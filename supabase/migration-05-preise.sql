-- Ergänzung 5: Oscars und Golden Globes speichern. Einmal im Supabase "SQL Editor" ausführen.
alter table public.titles add column if not exists oscars text[] not null default '{}';
alter table public.titles add column if not exists globes text[] not null default '{}';
