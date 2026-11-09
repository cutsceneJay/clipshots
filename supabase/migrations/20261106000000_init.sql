-- Clipshots: live moment catcher for esports broadcasts. Fresh schema.
-- Every table has row-level security: you see your own rows, or rows of
-- events you've been invited to.

create extension if not exists pgcrypto;

-- Events: a show / broadcast day (e.g. "VCT Masters, Day 3").
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  game text not null default 'generic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  status text not null default 'invited' check (status in ('invited', 'accepted')),
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

-- Matches: one catching session inside an event (a map, a game, a set).
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  source_kind text not null check (source_kind in ('url', 'vod', 'file', 'srt', 'rtmp', 'recording')),
  source_label text,
  status text not null default 'live' check (status in ('live', 'ended', 'failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

-- Moments: their own table. Seconds are the only source of truth.
create table public.moments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  start_sec numeric(10,2) not null check (start_sec >= 0),
  end_sec numeric(10,2) not null,
  peak_sec numeric(10,2) not null,
  trim_start_sec numeric(10,2),
  trim_end_sec numeric(10,2),
  peak_at timestamptz,
  score smallint not null check (score between 0 and 100),
  scan_score smallint not null check (scan_score between 0 and 100),
  ai_score smallint check (ai_score between 0 and 100),
  category text not null check (category in ('Multi-kill','Clutch','Objective','Team fight','Outplay','Caster hype','Crowd','Replay','Fail','Action')),
  label text,
  reason text not null check (char_length(reason) <= 100),
  kept boolean not null default true,
  source text not null check (source in ('ai', 'scan')),
  clip_path text,
  thumb_path text,
  latency_sec numeric(6,1),
  created_at timestamptz not null default now(),
  check (end_sec > start_sec),
  check (trim_start_sec is null or trim_end_sec is null or trim_end_sec > trim_start_sec)
);
create index moments_match_idx on public.moments(match_id, start_sec);
create index matches_event_idx on public.matches(event_id, started_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('moment', 'match', 'invite', 'error')),
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Access helpers (security definer so policies don't recurse).
create or replace function public.can_view_event(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = e and owner_id = auth.uid())
      or exists (select 1 from event_members m where m.event_id = e
                 and m.email = lower(coalesce(auth.jwt() ->> 'email', '')) and m.status = 'accepted');
$$;

create or replace function public.can_edit_event(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = e and owner_id = auth.uid())
      or exists (select 1 from event_members m where m.event_id = e
                 and m.email = lower(coalesce(auth.jwt() ->> 'email', '')) and m.status = 'accepted' and m.role = 'editor');
$$;

create or replace function public.match_event(m uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select event_id from matches where id = m;
$$;

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.matches enable row level security;
alter table public.moments enable row level security;
alter table public.notifications enable row level security;

create policy events_select on public.events for select using (public.can_view_event(id));
create policy events_insert on public.events for insert with check (owner_id = auth.uid());
create policy events_update on public.events for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy events_delete on public.events for delete using (owner_id = auth.uid());

create policy members_select on public.event_members for select using (
  public.can_view_event(event_id) or email = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy members_insert on public.event_members for insert with check (
  exists (select 1 from public.events where id = event_id and owner_id = auth.uid()));
create policy members_update on public.event_members for update using (
  exists (select 1 from public.events where id = event_id and owner_id = auth.uid())
  or email = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy members_delete on public.event_members for delete using (
  exists (select 1 from public.events where id = event_id and owner_id = auth.uid())
  or email = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy matches_select on public.matches for select using (public.can_view_event(event_id));
create policy matches_insert on public.matches for insert with check (owner_id = auth.uid() and public.can_edit_event(event_id));
create policy matches_update on public.matches for update using (public.can_edit_event(event_id));
create policy matches_delete on public.matches for delete using (public.can_edit_event(event_id));

create policy moments_select on public.moments for select using (public.can_view_event(public.match_event(match_id)));
create policy moments_insert on public.moments for insert with check (owner_id = auth.uid() and public.can_edit_event(public.match_event(match_id)));
create policy moments_update on public.moments for update using (public.can_edit_event(public.match_event(match_id)));
create policy moments_delete on public.moments for delete using (public.can_edit_event(public.match_event(match_id)));

create policy notifications_own on public.notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Invited members can accept only their own invite, and only change status.
create or replace function public.guard_member_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from events where id = old.event_id and owner_id = auth.uid()) then
    if new.role <> old.role or new.email <> old.email or new.event_id <> old.event_id then
      raise exception 'Only the event owner can change that';
    end if;
  end if;
  return new;
end $$;
create trigger member_update_guard before update on public.event_members
  for each row execute function public.guard_member_update();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

-- Live board updates.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.moments, public.matches, public.notifications;
  end if;
end $$;

-- Clip storage: clips/{event_id}/{match_id}/{file}. Private; anyone who can
-- see the event can read, editors can write.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('clips', 'clips', false) on conflict do nothing;
    create policy clips_read on storage.objects for select using (
      bucket_id = 'clips' and public.can_view_event(((storage.foldername(name))[1])::uuid));
    create policy clips_write on storage.objects for insert with check (
      bucket_id = 'clips' and public.can_edit_event(((storage.foldername(name))[1])::uuid));
    create policy clips_update on storage.objects for update using (
      bucket_id = 'clips' and public.can_edit_event(((storage.foldername(name))[1])::uuid));
    create policy clips_delete on storage.objects for delete using (
      bucket_id = 'clips' and public.can_edit_event(((storage.foldername(name))[1])::uuid));
  end if;
end $$;
