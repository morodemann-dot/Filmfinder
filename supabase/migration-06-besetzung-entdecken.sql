-- Ergänzung 6: Besetzung speichern + schnellere "Entdecken"-Abfrage.
-- Einmal im Supabase "SQL Editor" ausführen.
alter table public.titles add column if not exists cast_names text[] not null default '{}';
create index if not exists titles_created_idx on public.titles (created_at desc);

-- Liefert Titel, die die angemeldete Person noch NICHT eingeordnet hat – gefiltert und sortiert.
create or replace function public.discover_titles(
  p_media  text default null,   -- 'movie' / 'tv' / null = alle
  p_genre  text default null,
  p_decade int  default null,   -- z. B. 1990
  p_sort   text default 'beliebt', -- beliebt | neu | preise | jahr_neu | jahr_alt
  p_limit  int  default 60,
  p_offset int  default 0
) returns setof public.titles
language sql stable security invoker set search_path = public as $$
  select t.* from public.titles t
  where (p_media is null or t.media_type = p_media)
    and (p_genre is null or p_genre = any (t.genres))
    and (p_decade is null or (t.release_year >= p_decade and t.release_year < p_decade + 10))
    and (p_sort <> 'preise' or cardinality(t.oscars) + cardinality(t.globes) > 0)
    and not exists (
      select 1 from public.user_title_feedback f
      where f.title_id = t.id and f.user_id = (select auth.uid())
    )
  order by
    case when p_sort = 'neu' then t.created_at end desc nulls last,
    case when p_sort = 'preise' then cardinality(t.oscars) + cardinality(t.globes) end desc nulls last,
    case when p_sort = 'jahr_neu' then t.release_year end desc nulls last,
    case when p_sort = 'jahr_alt' then t.release_year end asc nulls last,
    t.popularity desc nulls last,
    t.id
  limit least(p_limit, 200) offset greatest(p_offset, 0);
$$;
grant execute on function public.discover_titles(text, text, int, text, int, int) to authenticated;

notify pgrst, 'reload schema';
