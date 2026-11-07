-- Ergänzung 14: Modell-Duell (blinder Test der KI-Modelle). Einmal im Supabase "SQL Editor" ausführen.
-- Antworten hier fließen NICHT in das Geschmacksprofil ein.
create table if not exists public.ai_duel (
  user_id     uuid not null references auth.users (id) on delete cascade,
  title_id    bigint not null references public.titles (id) on delete cascade,
  picked_by   text[] not null default '{}',   -- welche Quellen den Film vorgeschlagen haben (ohne, haiku, sonnet)
  answer      text check (answer in ('passt', 'passt_nicht', 'gesehen')),
  answered_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (user_id, title_id)
);
alter table public.ai_duel enable row level security; -- keine Regeln = nur der Server der App
notify pgrst, 'reload schema';
