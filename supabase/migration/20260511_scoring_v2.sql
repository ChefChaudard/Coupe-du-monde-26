-- SCORING V2 - additive, ne casse pas l'existant

create table if not exists public.group_rank_predictions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_name text not null,
  position int not null check (position between 1 and 4),
  team text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, group_name, position)
);

create table if not exists public.knockout_predictions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  phase text not null,
  team text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, phase, team)
);

create table if not exists public.score_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  label text,
  base_points numeric not null default 0,
  odds numeric not null default 1,
  points numeric not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists score_events_user_id_idx
on public.score_events(user_id);

create index if not exists score_events_source_idx
on public.score_events(source_type, source_id);

create or replace function public.prediction_outcome(a int, b int)
returns text
language sql
immutable
as $$
  select case
    when a > b then 'A'
    when a < b then 'B'
    else 'N'
  end;
$$;

create or replace function public.match_base_points(phase text)
returns numeric
language sql
immutable
as $$
  select case
    when phase ilike 'Groupe%' then 3
    else 6
  end;
$$;

create or replace function public.recalculate_all_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.score_events;

  -- 1. Points matchs avec cote dynamique
  insert into public.score_events (
    user_id,
    source_type,
    source_id,
    label,
    base_points,
    odds,
    points,
    details
  )
  with finished_matches as (
    select *
    from public.matches
    where is_finished = true
      and score_a is not null
      and score_b is not null
  ),
  match_stats as (
    select
      m.id as match_id,
      count(p.id)::numeric as players_total,
      count(*) filter (
        where public.prediction_outcome(p.predicted_a, p.predicted_b)
            = public.prediction_outcome(m.score_a, m.score_b)
      )::numeric as players_correct
    from finished_matches m
    join public.predictions p on p.match_id = m.id
    group by m.id
  )
  select
    p.user_id,
    'match',
    m.id::text,
    m.team_a || ' - ' || m.team_b,
    public.match_base_points(m.phase),
    case
      when ms.players_correct > 0 then ms.players_total / ms.players_correct
      else 0
    end as odds,
    case
      when public.prediction_outcome(p.predicted_a, p.predicted_b)
         = public.prediction_outcome(m.score_a, m.score_b)
      then public.match_base_points(m.phase) * (ms.players_total / nullif(ms.players_correct, 0))
      else 0
    end as points,
    jsonb_build_object(
      'phase', m.phase,
      'predicted_a', p.predicted_a,
      'predicted_b', p.predicted_b,
      'score_a', m.score_a,
      'score_b', m.score_b,
      'players_total', ms.players_total,
      'players_correct', ms.players_correct
    )
  from finished_matches m
  join public.predictions p on p.match_id = m.id
  join match_stats ms on ms.match_id = m.id
  where public.prediction_outcome(p.predicted_a, p.predicted_b)
      = public.prediction_outcome(m.score_a, m.score_b);

  -- 2. Total user_scores existant conservé
  insert into public.user_scores (user_id, points, updated_at)
  select
    p.id,
    coalesce(sum(se.points), 0),
    now()
  from public.profiles p
  left join public.score_events se on se.user_id = p.id
  group by p.id
  on conflict (user_id)
  do update set
    points = excluded.points,
    updated_at = excluded.updated_at;
end;
$$;

create or replace view public.leaderboard_v2 as
select
  p.id as user_id,
  p.nickname,
  coalesce(sum(se.points), 0) as points
from public.profiles p
left join public.score_events se on se.user_id = p.id
group by p.id, p.nickname
order by points desc, p.nickname asc;

create or replace view public.score_events_v2 as
select
  se.*,
  p.nickname
from public.score_events se
join public.profiles p on p.id = se.user_id
order by se.points desc, se.created_at desc;