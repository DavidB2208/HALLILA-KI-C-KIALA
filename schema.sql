-- HALLILA : C KI KIA LA
-- Schéma PostgreSQL / Supabase ready
-- Version complète avec comptes, personas, parties, rounds, réactions, historique et stats.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  profile_color text,
  linked_persona_id uuid null,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text not null check (category in ('core','others')),
  created_by_user_id uuid null references users(id) on delete set null,
  is_claimable boolean not null default true,
  claimed_by_user_id uuid null references users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table users drop constraint if exists users_linked_persona_id_fkey;
alter table users add constraint users_linked_persona_id_fkey foreign key (linked_persona_id) references personas(id) on delete set null;

create table if not exists persona_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  owner_user_id uuid null references users(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('private','shared','public')),
  is_default_core boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists persona_set_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references persona_sets(id) on delete cascade,
  persona_id uuid not null references personas(id) on delete cascade,
  display_order integer not null default 0,
  unique(set_id, persona_id)
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  admin_token text null,
  live_state_json jsonb not null default '{}'::jsonb,
  host_user_id uuid null references users(id) on delete set null,
  title text null,
  theme_mode text not null check (theme_mode in ('manual','idea_box')),
  theme_text text null,
  status text not null check (status in ('lobby','ranking','podium','results','closed')),
  set_id uuid null references persona_sets(id) on delete set null,
  allow_others boolean not null default true,
  allow_likes boolean not null default true,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  ended_at timestamptz null
);

create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid null references users(id) on delete set null,
  guest_name text null,
  player_name text not null,
  selected_color text,
  linked_persona_id uuid null references personas(id) on delete set null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  submitted_at timestamptz null,
  is_connected boolean not null default true
);

create table if not exists game_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round_number integer not null,
  theme_mode text not null check (theme_mode in ('manual','idea_box')),
  theme_text text,
  status text not null check (status in ('lobby','ranking','podium','results')),
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  ended_at timestamptz null,
  unique(game_id, round_number)
);

create table if not exists idea_box_entries (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round_id uuid null references game_rounds(id) on delete set null,
  submitted_by_player_id uuid not null references game_players(id) on delete cascade,
  theme_text text not null,
  is_used boolean not null default false,
  used_in_round_id uuid null references game_rounds(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists player_rankings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round_id uuid null references game_rounds(id) on delete cascade,
  player_id uuid not null references game_players(id) on delete cascade,
  persona_id uuid not null references personas(id) on delete cascade,
  tier text not null check (tier in ('S','A','B','C','D','E')),
  score_value integer not null check (score_value in (0,1,2,3,4,5)),
  updated_at timestamptz not null default now(),
  unique(round_id, player_id, persona_id)
);

create table if not exists round_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round_id uuid not null references game_rounds(id) on delete cascade,
  persona_id uuid not null references personas(id) on delete cascade,
  total_points integer not null default 0,
  average_score numeric(8,2) not null default 0,
  score_percent numeric(8,2) not null default 0,
  final_tier text not null check (final_tier in ('S','A','B','C','D','E')),
  rank_position integer,
  unique(round_id, persona_id)
);

create table if not exists round_reactions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references game_rounds(id) on delete cascade,
  player_id uuid not null references game_players(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like','dislike')),
  created_at timestamptz not null default now(),
  unique(round_id, player_id)
);

create table if not exists history_entries (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round_id uuid not null references game_rounds(id) on delete cascade,
  title text not null,
  theme_text text,
  players_count integer not null default 0,
  created_by_user_id uuid null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  snapshot_json jsonb not null default '{}'::jsonb
);

create table if not exists history_entry_players (
  id uuid primary key default gen_random_uuid(),
  history_entry_id uuid not null references history_entries(id) on delete cascade,
  player_id uuid not null references game_players(id) on delete cascade,
  user_id uuid null references users(id) on delete set null,
  is_host boolean not null default false,
  unique(history_entry_id, player_id)
);

create or replace view persona_stats as
select
  p.id as persona_id,
  count(rr.id) as games_count,
  round(avg(rr.score_percent)::numeric, 2) as avg_score_percent,
  round(avg(case rr.final_tier when 'S' then 5 when 'A' then 4 when 'B' then 3 when 'C' then 2 when 'D' then 1 else 0 end)::numeric, 2) as avg_rank_value,
  count(*) filter (where rr.final_tier = 'S') as s_count,
  count(*) filter (where rr.final_tier = 'A') as a_count,
  count(*) filter (where rr.final_tier = 'B') as b_count,
  count(*) filter (where rr.final_tier = 'C') as c_count,
  count(*) filter (where rr.final_tier = 'D') as d_count,
  count(*) filter (where rr.final_tier = 'E') as e_count,
  max(rr.score_percent) as best_score,
  min(rr.score_percent) as worst_score,
  (select rr2.score_percent from round_results rr2 join game_rounds gr2 on gr2.id = rr2.round_id where rr2.persona_id = p.id order by coalesce(gr2.ended_at, gr2.created_at) desc limit 1) as last_score
from personas p
left join round_results rr on rr.persona_id = p.id
group by p.id;

create or replace view user_stats as
select
  u.id as user_id,
  count(distinct gp.id) filter (where gp.is_host = false) as games_played,
  count(distinct g.id) filter (where g.host_user_id = u.id) as games_hosted,
  count(rrx.id) filter (where rrx.reaction_type = 'like') as likes_given,
  count(rrx.id) filter (where rrx.reaction_type = 'dislike') as dislikes_given,
  count(distinct rr.round_id) filter (where p.id = u.linked_persona_id) as linked_persona_games
from users u
left join game_players gp on gp.user_id = u.id
left join games g on g.host_user_id = u.id
left join round_reactions rrx on rrx.player_id = gp.id
left join personas p on p.id = u.linked_persona_id
left join round_results rr on rr.persona_id = p.id
group by u.id;

create index if not exists idx_personas_slug on personas(slug);
create index if not exists idx_game_players_game on game_players(game_id);
create index if not exists idx_game_rounds_game on game_rounds(game_id);
create index if not exists idx_player_rankings_round on player_rankings(round_id);
create index if not exists idx_round_results_round on round_results(round_id);
create index if not exists idx_history_entries_completed on history_entries(completed_at desc);

insert into personas (name, slug, category, is_claimable, is_active)
select *
from (values
('Isaac', 'isaac', 'core', true, true),
('Liam', 'liam', 'core', true, true),
('Ariel', 'ariel', 'core', true, true),
('Samuel', 'samuel', 'core', true, true),
('Nathan', 'nathan', 'core', true, true),
('Alex', 'alex', 'core', true, true),
('Eitan', 'eitan', 'core', true, true),
('Gabriel', 'gabriel', 'core', true, true),
('Adam', 'adam', 'core', true, true),
('David', 'david', 'core', true, true)
) as seed(name, slug, category, is_claimable, is_active)
on conflict (slug) do nothing;

create index if not exists idx_games_admin_token on games(admin_token);


-- =========================
-- Triggers de protection
-- =========================

create or replace function protect_core_personas()
returns trigger as $$
begin
  if old.category = 'core' then
    new.name := old.name;
    new.slug := old.slug;
    new.category := old.category;
    new.created_by_user_id := old.created_by_user_id;
    new.is_claimable := old.is_claimable;
    new.is_active := old.is_active;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_protect_core_personas on personas;
create trigger trg_protect_core_personas
before update on personas
for each row execute function protect_core_personas();

-- =========================
-- Fonctions helpers RLS
-- =========================

create or replace function public.is_game_host(target_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    where g.id = target_game_id
      and g.host_user_id = auth.uid()
  );
$$;

create or replace function public.can_read_set(target_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.persona_sets s
    where s.id = target_set_id
      and (
        s.visibility in ('shared', 'public')
        or s.owner_user_id = auth.uid()
      )
  );
$$;

create or replace function public.owns_history_entry(target_history_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.history_entries h
    where h.id = target_history_entry_id
      and h.created_by_user_id = auth.uid()
  );
$$;

grant execute on function public.is_game_host(uuid) to authenticated;
grant execute on function public.can_read_set(uuid) to anon, authenticated;
grant execute on function public.owns_history_entry(uuid) to authenticated;

-- =========================
-- Enable RLS
-- =========================

alter table public.users enable row level security;
alter table public.personas enable row level security;
alter table public.persona_sets enable row level security;
alter table public.persona_set_items enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_rounds enable row level security;
alter table public.idea_box_entries enable row level security;
alter table public.player_rankings enable row level security;
alter table public.round_results enable row level security;
alter table public.round_reactions enable row level security;
alter table public.history_entries enable row level security;
alter table public.history_entry_players enable row level security;

-- =========================
-- Drop policies si rerun
-- =========================

drop policy if exists users_select_own on public.users;
drop policy if exists users_insert_own on public.users;
drop policy if exists users_update_own on public.users;
drop policy if exists users_delete_own on public.users;

drop policy if exists personas_public_read on public.personas;
drop policy if exists personas_authenticated_insert on public.personas;
drop policy if exists personas_authenticated_update on public.personas;

drop policy if exists persona_sets_read_accessible on public.persona_sets;
drop policy if exists persona_sets_insert_owner on public.persona_sets;
drop policy if exists persona_sets_update_owner on public.persona_sets;
drop policy if exists persona_sets_delete_owner on public.persona_sets;

drop policy if exists persona_set_items_read_accessible on public.persona_set_items;
drop policy if exists persona_set_items_write_owner on public.persona_set_items;

drop policy if exists games_host_only_select on public.games;
drop policy if exists games_host_only_insert on public.games;
drop policy if exists games_host_only_update on public.games;
drop policy if exists games_host_only_delete on public.games;

drop policy if exists game_rounds_host_only_all on public.game_rounds;
drop policy if exists game_players_host_only_all on public.game_players;
drop policy if exists idea_box_entries_host_only_all on public.idea_box_entries;
drop policy if exists player_rankings_host_only_all on public.player_rankings;
drop policy if exists round_results_host_only_all on public.round_results;
drop policy if exists round_reactions_host_only_all on public.round_reactions;

drop policy if exists history_entries_public_read on public.history_entries;
drop policy if exists history_entries_owner_write on public.history_entries;
drop policy if exists history_entry_players_public_read on public.history_entry_players;
drop policy if exists history_entry_players_owner_write on public.history_entry_players;

-- =========================
-- Policies
-- =========================

create policy users_select_own
on public.users
for select
to authenticated
using ((select auth.uid()) = id);

create policy users_insert_own
on public.users
for insert
to authenticated
with check ((select auth.uid()) = id and role = 'user');

create policy users_update_own
on public.users
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and role = 'user');

create policy users_delete_own
on public.users
for delete
to authenticated
using ((select auth.uid()) = id);

create policy personas_public_read
on public.personas
for select
to anon, authenticated
using (is_active = true);

create policy personas_authenticated_insert
on public.personas
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  or (
    category = 'core'
    and created_by_user_id is null
  )
);

create policy personas_authenticated_update
on public.personas
for update
to authenticated
using (
  category = 'core'
  or created_by_user_id = (select auth.uid())
  or claimed_by_user_id = (select auth.uid())
)
with check (
  category = 'core'
  or created_by_user_id = (select auth.uid())
  or claimed_by_user_id = (select auth.uid())
);

create policy persona_sets_read_accessible
on public.persona_sets
for select
to anon, authenticated
using (
  visibility in ('shared', 'public')
  or owner_user_id = (select auth.uid())
);

create policy persona_sets_insert_owner
on public.persona_sets
for insert
to authenticated
with check (owner_user_id = (select auth.uid()));

create policy persona_sets_update_owner
on public.persona_sets
for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

create policy persona_sets_delete_owner
on public.persona_sets
for delete
to authenticated
using (owner_user_id = (select auth.uid()));

create policy persona_set_items_read_accessible
on public.persona_set_items
for select
to anon, authenticated
using (public.can_read_set(set_id));

create policy persona_set_items_write_owner
on public.persona_set_items
for all
to authenticated
using (public.can_read_set(set_id) and exists (
  select 1 from public.persona_sets s
  where s.id = set_id and s.owner_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.persona_sets s
  where s.id = set_id and s.owner_user_id = (select auth.uid())
));

create policy games_host_only_select
on public.games
for select
to authenticated
using (host_user_id = (select auth.uid()));

create policy games_host_only_insert
on public.games
for insert
to authenticated
with check (host_user_id = (select auth.uid()));

create policy games_host_only_update
on public.games
for update
to authenticated
using (host_user_id = (select auth.uid()))
with check (host_user_id = (select auth.uid()));

create policy games_host_only_delete
on public.games
for delete
to authenticated
using (host_user_id = (select auth.uid()));

create policy game_rounds_host_only_all
on public.game_rounds
for all
to authenticated
using (public.is_game_host(game_id))
with check (public.is_game_host(game_id));

create policy game_players_host_only_all
on public.game_players
for all
to authenticated
using (public.is_game_host(game_id))
with check (public.is_game_host(game_id));

create policy idea_box_entries_host_only_all
on public.idea_box_entries
for all
to authenticated
using (public.is_game_host(game_id))
with check (public.is_game_host(game_id));

create policy player_rankings_host_only_all
on public.player_rankings
for all
to authenticated
using (public.is_game_host(game_id))
with check (public.is_game_host(game_id));

create policy round_results_host_only_all
on public.round_results
for all
to authenticated
using (public.is_game_host(game_id))
with check (public.is_game_host(game_id));

create policy round_reactions_host_only_all
on public.round_reactions
for all
to authenticated
using (exists (
  select 1
  from public.game_rounds gr
  join public.games g on g.id = gr.game_id
  where gr.id = round_id
    and g.host_user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.game_rounds gr
  join public.games g on g.id = gr.game_id
  where gr.id = round_id
    and g.host_user_id = (select auth.uid())
));

create policy history_entries_public_read
on public.history_entries
for select
to anon, authenticated
using (true);

create policy history_entries_owner_write
on public.history_entries
for all
to authenticated
using (created_by_user_id = (select auth.uid()))
with check (created_by_user_id = (select auth.uid()));

create policy history_entry_players_public_read
on public.history_entry_players
for select
to anon, authenticated
using (true);

create policy history_entry_players_owner_write
on public.history_entry_players
for all
to authenticated
using (public.owns_history_entry(history_entry_id))
with check (public.owns_history_entry(history_entry_id));
