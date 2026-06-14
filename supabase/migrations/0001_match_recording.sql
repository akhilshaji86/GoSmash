create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  home_base text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  normalized_name text not null,
  home_base text,
  profile_id uuid references public.profiles (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (normalized_name)
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  location text not null default 'Open play',
  scheduled_at timestamptz not null,
  players_required integer not null default 4 check (players_required between 2 and 20),
  host_profile_id uuid references auth.users (id) on delete set null,
  host_player_id uuid references public.players (id) on delete set null,
  host_display_name text not null,
  status text not null default 'open' check (status in ('open', 'full', 'cancelled', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_join_requests (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  profile_id uuid references auth.users (id) on delete set null,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decision_note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (game_session_id, display_name)
);

create table if not exists public.game_session_players (
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  profile_id uuid references auth.users (id) on delete set null,
  display_name text not null,
  role text not null default 'approved' check (role in ('host', 'approved')),
  approved_at timestamptz not null default now(),
  primary key (game_session_id, display_name)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid references public.game_sessions (id) on delete set null,
  location text not null default 'Open play',
  format text not null check (format in ('singles', 'doubles')),
  status text not null default 'recording' check (status in ('recording', 'final')),
  target_points integer not null default 21 check (target_points between 1 and 99),
  opening_server text not null default 'teamA' check (opening_server in ('teamA', 'teamB')),
  team_a_score integer not null default 0 check (team_a_score >= 0),
  team_b_score integer not null default 0 check (team_b_score >= 0),
  winner text check (winner in ('teamA', 'teamB')),
  played_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_participants (
  match_id uuid not null references public.matches (id) on delete cascade,
  side text not null check (side in ('teamA', 'teamB')),
  slot integer not null check (slot between 1 and 2),
  player_id uuid references public.players (id) on delete restrict,
  display_name text not null,
  primary key (match_id, side, slot)
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  seq integer not null,
  side text not null check (side in ('teamA', 'teamB')),
  reason text not null default 'opponent_mistake' check (reason in ('shot', 'opponent_mistake')),
  shot_type text check (shot_type in ('smash', 'clear', 'drop', 'net', 'lob', 'fault')),
  scorer_player text,
  mistake_player text,
  mistake_by text check (mistake_by in ('teamA', 'teamB')),
  server_side text check (server_side in ('teamA', 'teamB')),
  server_court text check (server_court in ('right', 'left')),
  server_player text,
  receiver_player text,
  team_a_score integer not null check (team_a_score >= 0),
  team_b_score integer not null check (team_b_score >= 0),
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (match_id, seq)
);

create table if not exists public.leaderboard_entries (
  player_id uuid not null references public.players (id) on delete cascade,
  player_name text not null,
  rating integer not null default 1000,
  matches integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  points_for integer not null default 0,
  points_against integer not null default 0,
  point_diff integer not null default 0,
  win_rate integer not null default 0,
  last_played_at timestamptz,
  generated_at timestamptz not null default now(),
  primary key (player_id)
);

create index if not exists matches_location_played_at_idx on public.matches (location, played_at desc);
create index if not exists game_sessions_location_scheduled_idx on public.game_sessions (location, scheduled_at);
create index if not exists game_join_requests_session_status_idx on public.game_join_requests (game_session_id, status);
create index if not exists game_session_players_session_idx on public.game_session_players (game_session_id);
create index if not exists match_events_match_seq_idx on public.match_events (match_id, seq);
create index if not exists leaderboard_rating_idx on public.leaderboard_entries (rating desc, wins desc);

create or replace function public.badminton_winner(
  p_team_a_score integer,
  p_team_b_score integer,
  p_target_points integer default 21
)
returns text
language plpgsql
immutable
as $$
declare
  target integer := greatest(1, coalesce(p_target_points, 21));
  point_cap integer := greatest(1, coalesce(p_target_points, 21)) + 9;
  high_score integer;
  low_score integer;
  lead integer;
  leader text;
begin
  if p_team_a_score = p_team_b_score then
    return null;
  end if;

  if p_team_a_score > p_team_b_score then
    leader := 'teamA';
    high_score := p_team_a_score;
    low_score := p_team_b_score;
  else
    leader := 'teamB';
    high_score := p_team_b_score;
    low_score := p_team_a_score;
  end if;

  lead := high_score - low_score;

  if high_score >= point_cap then
    return leader;
  end if;

  if high_score >= target and lead >= 2 then
    return leader;
  end if;

  return null;
end;
$$;

create or replace function public.create_game_session(
  p_location text,
  p_scheduled_at timestamptz,
  p_players_required integer,
  p_host_display_name text,
  p_host_player_id uuid default null
)
returns public.game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  created_game public.game_sessions%rowtype;
  normalized_location text := nullif(trim(p_location), '');
  normalized_name text := nullif(trim(p_host_display_name), '');
  player_count integer := least(20, greatest(2, coalesce(p_players_required, 4)));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if normalized_name is null then
    raise exception 'Host display name is required';
  end if;

  insert into public.game_sessions (
    location,
    scheduled_at,
    players_required,
    host_profile_id,
    host_player_id,
    host_display_name
  )
  values (
    coalesce(normalized_location, 'Open play'),
    p_scheduled_at,
    player_count,
    auth.uid(),
    p_host_player_id,
    normalized_name
  )
  returning * into created_game;

  insert into public.game_session_players (
    game_session_id,
    player_id,
    profile_id,
    display_name,
    role
  )
  values (
    created_game.id,
    p_host_player_id,
    auth.uid(),
    normalized_name,
    'host'
  )
  on conflict (game_session_id, display_name)
  do update set
    player_id = excluded.player_id,
    profile_id = excluded.profile_id,
    role = 'host';

  return created_game;
end;
$$;

create or replace function public.request_game_join(
  p_game_session_id uuid,
  p_display_name text,
  p_player_id uuid default null
)
returns public.game_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_game public.game_sessions%rowtype;
  join_request public.game_join_requests%rowtype;
  normalized_name text := nullif(trim(p_display_name), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if normalized_name is null then
    raise exception 'Display name is required';
  end if;

  select *
    into locked_game
    from public.game_sessions
   where id = p_game_session_id
   for update;

  if not found then
    raise exception 'Game session not found: %', p_game_session_id;
  end if;

  if locked_game.status <> 'open' then
    raise exception 'Cannot join a closed game';
  end if;

  if exists (
    select 1
      from public.game_session_players
     where game_session_id = p_game_session_id
       and lower(display_name) = lower(normalized_name)
  ) then
    raise exception 'Player is already approved for this game';
  end if;

  insert into public.game_join_requests (
    game_session_id,
    player_id,
    profile_id,
    display_name,
    status
  )
  values (
    p_game_session_id,
    p_player_id,
    auth.uid(),
    normalized_name,
    'pending'
  )
  on conflict (game_session_id, display_name)
  do update set
    player_id = excluded.player_id,
    profile_id = excluded.profile_id,
    status = 'pending',
    requested_at = now(),
    decided_at = null
  returning * into join_request;

  return join_request;
end;
$$;

create or replace function public.decide_game_join_request(
  p_request_id uuid,
  p_status text,
  p_decision_note text default null
)
returns public.game_join_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_request public.game_join_requests%rowtype;
  locked_game public.game_sessions%rowtype;
  decided_request public.game_join_requests%rowtype;
begin
  if p_status not in ('approved', 'declined') then
    raise exception 'Decision must be approved or declined';
  end if;

  select *
    into locked_request
    from public.game_join_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Join request not found: %', p_request_id;
  end if;

  select *
    into locked_game
    from public.game_sessions
   where id = locked_request.game_session_id
   for update;

  if locked_game.host_profile_id <> auth.uid() then
    raise exception 'Only the host can decide join requests';
  end if;

  update public.game_join_requests
     set status = p_status,
         decision_note = nullif(trim(p_decision_note), ''),
         decided_at = now()
   where id = p_request_id
  returning * into decided_request;

  if p_status = 'approved' then
    insert into public.game_session_players (
      game_session_id,
      player_id,
      profile_id,
      display_name,
      role
    )
    values (
      decided_request.game_session_id,
      decided_request.player_id,
      decided_request.profile_id,
      decided_request.display_name,
      'approved'
    )
    on conflict (game_session_id, display_name)
    do update set
      player_id = excluded.player_id,
      profile_id = excluded.profile_id,
      role = excluded.role,
      approved_at = now();
  end if;

  return decided_request;
end;
$$;

create or replace function public.set_opening_server(
  p_match_id uuid,
  p_side text
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_match public.matches%rowtype;
  updated_match public.matches%rowtype;
begin
  if p_side not in ('teamA', 'teamB') then
    raise exception 'Invalid side: %', p_side;
  end if;

  select *
    into locked_match
    from public.matches
   where id = p_match_id
   for update;

  if not found then
    raise exception 'Match not found: %', p_match_id;
  end if;

  if locked_match.status <> 'recording' then
    raise exception 'Cannot change service on a finalized match';
  end if;

  if exists (select 1 from public.match_events where match_id = p_match_id) then
    raise exception 'Opening server can only be changed before the first point';
  end if;

  update public.matches
     set opening_server = p_side,
         updated_at = now()
   where id = p_match_id
  returning * into updated_match;

  return updated_match;
end;
$$;

create or replace function public.swap_opening_players(
  p_match_id uuid,
  p_side text
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_match public.matches%rowtype;
  first_participant public.match_participants%rowtype;
  second_participant public.match_participants%rowtype;
  updated_match public.matches%rowtype;
begin
  if p_side not in ('teamA', 'teamB') then
    raise exception 'Invalid side: %', p_side;
  end if;

  select *
    into locked_match
    from public.matches
   where id = p_match_id
   for update;

  if not found then
    raise exception 'Match not found: %', p_match_id;
  end if;

  if locked_match.status <> 'recording' then
    raise exception 'Cannot change court positions on a finalized match';
  end if;

  if locked_match.format <> 'doubles' then
    raise exception 'Opening court positions only apply to doubles matches';
  end if;

  if exists (select 1 from public.match_events where match_id = p_match_id) then
    raise exception 'Opening court positions can only be changed before the first point';
  end if;

  select *
    into first_participant
    from public.match_participants
   where match_id = p_match_id and side = p_side and slot = 1;

  select *
    into second_participant
    from public.match_participants
   where match_id = p_match_id and side = p_side and slot = 2;

  if first_participant.match_id is null or second_participant.match_id is null then
    raise exception 'Doubles side needs two players before switching positions';
  end if;

  delete from public.match_participants
   where match_id = p_match_id and side = p_side and slot in (1, 2);

  insert into public.match_participants (match_id, side, slot, player_id, display_name)
  values
    (
      second_participant.match_id,
      second_participant.side,
      1,
      second_participant.player_id,
      second_participant.display_name
    ),
    (
      first_participant.match_id,
      first_participant.side,
      2,
      first_participant.player_id,
      first_participant.display_name
    );

  update public.matches
     set updated_at = now()
   where id = p_match_id
  returning * into updated_match;

  return updated_match;
end;
$$;

create or replace function public.record_point(
  p_match_id uuid,
  p_side text,
  p_reason text default 'opponent_mistake',
  p_shot_type text default null,
  p_scorer_player text default null,
  p_mistake_player text default null,
  p_mistake_by text default null
)
returns public.match_events
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_match public.matches%rowtype;
  next_seq integer;
  next_a integer;
  next_b integer;
  next_winner text;
  current_server_side text;
  current_server_score integer;
  current_server_court text;
  current_receiver_side text;
  current_server_player text;
  current_receiver_player text;
  created_event public.match_events%rowtype;
begin
  if p_side not in ('teamA', 'teamB') then
    raise exception 'Invalid side: %', p_side;
  end if;

  if p_reason not in ('shot', 'opponent_mistake') then
    raise exception 'Invalid point reason: %', p_reason;
  end if;

  if p_mistake_by is not null and p_mistake_by not in ('teamA', 'teamB') then
    raise exception 'Invalid mistake side: %', p_mistake_by;
  end if;

  if p_shot_type = 'fault' then
    p_reason := 'opponent_mistake';
  end if;

  if p_reason = 'shot' and p_shot_type not in ('smash', 'clear', 'drop', 'net', 'lob') then
    raise exception 'A shot point needs a valid shot type';
  end if;

  if p_reason = 'opponent_mistake' and p_shot_type <> 'fault' then
    p_shot_type := null;
  end if;

  select *
    into locked_match
    from public.matches
   where id = p_match_id
   for update;

  if not found then
    raise exception 'Match not found: %', p_match_id;
  end if;

  if locked_match.status <> 'recording' then
    raise exception 'Cannot score a finalized match';
  end if;

  select coalesce(max(seq), 0) + 1
    into next_seq
    from public.match_events
   where match_id = p_match_id;

  next_a := locked_match.team_a_score + case when p_side = 'teamA' then 1 else 0 end;
  next_b := locked_match.team_b_score + case when p_side = 'teamB' then 1 else 0 end;
  next_winner := public.badminton_winner(next_a, next_b, locked_match.target_points);
  current_server_side := coalesce(
    (select side from public.match_events where match_id = p_match_id order by seq desc limit 1),
    locked_match.opening_server
  );
  current_receiver_side := case when current_server_side = 'teamA' then 'teamB' else 'teamA' end;
  current_server_score := case when current_server_side = 'teamA' then locked_match.team_a_score else locked_match.team_b_score end;
  current_server_court := case when current_server_score % 2 = 0 then 'right' else 'left' end;

  select display_name
    into current_server_player
    from public.match_participants
   where match_id = p_match_id
     and side = current_server_side
     and slot = case when current_server_court = 'right' then 1 else 2 end;

  select display_name
    into current_receiver_player
    from public.match_participants
   where match_id = p_match_id
     and side = current_receiver_side
     and slot = case when current_server_court = 'right' then 1 else 2 end;

  insert into public.match_events (
    match_id,
    seq,
    side,
    reason,
    shot_type,
    scorer_player,
    mistake_player,
    mistake_by,
    server_side,
    server_court,
    server_player,
    receiver_player,
    team_a_score,
    team_b_score,
    created_by
  )
  values (
    p_match_id,
    next_seq,
    p_side,
    p_reason,
    p_shot_type,
    nullif(trim(p_scorer_player), ''),
    nullif(trim(p_mistake_player), ''),
    case
      when p_reason = 'opponent_mistake' and p_mistake_by is not null then p_mistake_by
      when p_reason = 'opponent_mistake' and p_side = 'teamA' then 'teamB'
      when p_reason = 'opponent_mistake' and p_side = 'teamB' then 'teamA'
      else null
    end,
    current_server_side,
    current_server_court,
    current_server_player,
    current_receiver_player,
    next_a,
    next_b,
    auth.uid()
  )
  returning * into created_event;

  update public.matches
     set team_a_score = next_a,
         team_b_score = next_b,
         status = case when next_winner is null then 'recording' else 'final' end,
         winner = next_winner,
         played_at = case when next_winner is null then played_at else now() end,
         updated_at = now()
   where id = p_match_id;

  return created_event;
end;
$$;

create or replace function public.finalize_match(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_match public.matches%rowtype;
  final_match public.matches%rowtype;
  final_winner text;
begin
  select *
    into locked_match
    from public.matches
   where id = p_match_id
   for update;

  if not found then
    raise exception 'Match not found: %', p_match_id;
  end if;

  final_winner := public.badminton_winner(
    locked_match.team_a_score,
    locked_match.team_b_score,
    locked_match.target_points
  );

  if final_winner is null then
    raise exception 'Match has not reached a legal badminton final score';
  end if;

  update public.matches
     set status = 'final',
         winner = final_winner,
         played_at = now(),
         updated_at = now()
   where id = p_match_id
  returning * into final_match;

  return final_match;
end;
$$;

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_join_requests enable row level security;
alter table public.game_session_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.match_events enable row level security;
alter table public.leaderboard_entries enable row level security;

create policy "Profiles are readable" on public.profiles for select using (true);
create policy "Players are readable" on public.players for select using (true);
create policy "Game sessions are readable" on public.game_sessions for select using (true);
create policy "Game join requests are readable" on public.game_join_requests for select using (true);
create policy "Game session players are readable" on public.game_session_players for select using (true);
create policy "Matches are readable" on public.matches for select using (true);
create policy "Match participants are readable" on public.match_participants for select using (true);
create policy "Match events are readable" on public.match_events for select using (true);
create policy "Leaderboard is readable" on public.leaderboard_entries for select using (true);

create policy "Users manage own profile" on public.profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Authenticated users create players" on public.players
  for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users create game sessions" on public.game_sessions
  for insert
  with check (auth.role() = 'authenticated' and host_profile_id = auth.uid());

create policy "Game hosts update game sessions" on public.game_sessions
  for update
  using (host_profile_id = auth.uid())
  with check (host_profile_id = auth.uid());

create policy "Authenticated users request game joins" on public.game_join_requests
  for insert
  with check (auth.role() = 'authenticated' and profile_id = auth.uid());

create policy "Requesters and hosts update game joins" on public.game_join_requests
  for update
  using (
    profile_id = auth.uid()
    or exists (
      select 1
        from public.game_sessions
       where game_sessions.id = game_join_requests.game_session_id
         and game_sessions.host_profile_id = auth.uid()
    )
  )
  with check (
    profile_id = auth.uid()
    or exists (
      select 1
        from public.game_sessions
       where game_sessions.id = game_join_requests.game_session_id
         and game_sessions.host_profile_id = auth.uid()
    )
  );

create policy "Authenticated users create approved game players" on public.game_session_players
  for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users create matches" on public.matches
  for insert
  with check (auth.role() = 'authenticated');

create policy "Match creators update matches" on public.matches
  for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Authenticated users create participants" on public.match_participants
  for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users create events" on public.match_events
  for insert
  with check (auth.role() = 'authenticated');
