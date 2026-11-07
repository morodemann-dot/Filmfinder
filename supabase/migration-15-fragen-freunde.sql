-- Ergänzung 15: Kurze Fragen, "Heute nicht", Profile für Freunde-Funktionen. Einmal im Supabase "SQL Editor" ausführen.

-- Was hat gefallen / gestört (z. B. "+regie:Christopher Nolan", "-aspekt:langatmig")
alter table public.user_title_feedback add column if not exists aspects text[] not null default '{}';

-- "Heute nicht" / "Vielleicht später": Film für eine Weile ausblenden
create table if not exists public.snoozed (
  user_id  uuid not null references auth.users (id) on delete cascade,
  title_id bigint not null references public.titles (id) on delete cascade,
  until    timestamptz not null,
  primary key (user_id, title_id)
);
alter table public.snoozed enable row level security;
drop policy if exists "Eigene Pausen" on public.snoozed;
create policy "Eigene Pausen" on public.snoozed for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Profil: Anzeigename + Freigabe fürs gemeinsame Schauen (freiwillig)
create table if not exists public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  share_together boolean not null default false,
  updated_at     timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Eigenes Profil" on public.profiles;
create policy "Eigenes Profil" on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
