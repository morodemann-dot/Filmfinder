-- Ergänzung 13: KI-Einschätzungen (Stufe 2). Einmal im Supabase "SQL Editor" ausführen.
create table if not exists public.title_features (
  title_id      bigint not null references public.titles (id) on delete cascade,
  model         text not null,                -- 'haiku' oder 'sonnet'
  features      jsonb not null,               -- Stimmung, Tempo, Komplexität …
  had_plot      boolean not null default false, -- lag eine Wikipedia-Handlung vor?
  input_tokens  integer not null default 0,   -- für die Kostenübersicht
  output_tokens integer not null default 0,
  created_at    timestamptz not null default now(),
  primary key (title_id, model)
);
alter table public.title_features enable row level security;
drop policy if exists "KI-Merkmale lesen" on public.title_features;
create policy "KI-Merkmale lesen" on public.title_features for select to authenticated using (true);
notify pgrst, 'reload schema';
