-- Notify the event owner and accepted teammates about big moments and finished matches.
create or replace function public.notify_event(e uuid, k text, t text, b text, l text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link)
  select owner_id, k, t, b, l from events where id = e
  union
  select u.id, k, t, b, l from event_members m join auth.users u on lower(u.email) = m.email
   where m.event_id = e and m.status = 'accepted';
$$;

create or replace function public.on_moment_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare mt record;
begin
  select m.name, m.event_id into mt from matches m where m.id = new.match_id;
  if new.kept and new.score >= 85 then
    perform notify_event(mt.event_id, 'moment', coalesce(new.label, new.category) || ' in ' || mt.name, new.reason, '/matches/' || new.match_id);
  end if;
  return new;
end $$;
create trigger moment_notify after insert on public.moments for each row execute function public.on_moment_insert();

create or replace function public.on_match_end() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if old.status = 'live' and new.status <> 'live' then
    select count(*) into n from moments where match_id = new.id and kept;
    perform notify_event(new.event_id, 'match', new.name || ' report is ready', n || ' moments caught', '/matches/' || new.id);
  end if;
  return new;
end $$;
create trigger match_end_notify after update on public.matches for each row execute function public.on_match_end();
