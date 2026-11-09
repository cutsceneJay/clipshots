\set ON_ERROR_STOP 1
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public, storage to authenticated;
grant execute on all functions in schema public, auth, storage to authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','jay@cutscene.test'),('22222222-2222-2222-2222-222222222222','sam@other.test'),('33333333-3333-3333-3333-333333333333','pat@other.test');

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); perform set_config('request.jwt.claims', json_build_object('sub',uid,'email',email)::text, false); end $$;

set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111','jay@cutscene.test');
insert into events (id,name,game) values ('aaaaaaaa-0000-0000-0000-000000000001','Masters Day 3','valorant');
insert into matches (id,event_id,name,source_kind) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Map 1','srt');
insert into moments (match_id,start_sec,end_sec,peak_sec,score,scan_score,category,reason,source) values ('bbbbbbbb-0000-0000-0000-000000000001',16.3,25,21.3,92,97,'Clutch','1v3 to save the round','ai');
insert into event_members (event_id,email,role) values ('aaaaaaaa-0000-0000-0000-000000000001','sam@other.test','viewer');
insert into storage.objects (bucket_id,name) values ('clips','aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001/a.mp4');

-- Pat: a stranger. Sees nothing, can't write.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333','pat@other.test');
do $$ begin
  if (select count(*) from events) <> 0 then raise exception 'FAIL stranger sees events'; end if;
  if (select count(*) from moments) <> 0 then raise exception 'FAIL stranger sees moments'; end if;
  if (select count(*) from storage.objects) <> 0 then raise exception 'FAIL stranger sees clips'; end if;
  begin insert into matches (event_id,name,source_kind) values ('aaaaaaaa-0000-0000-0000-000000000001','x','srt'); raise exception 'FAIL stranger inserted match';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS stranger isolated';
end $$;

-- Sam: invited but not accepted yet. Sees only the invite.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','sam@other.test');
do $$ begin
  if (select count(*) from moments) <> 0 then raise exception 'FAIL pending invite sees moments'; end if;
  if (select count(*) from event_members) <> 1 then raise exception 'FAIL invitee cannot see own invite'; end if;
  raise notice 'PASS pending invite sees only the invite';
end $$;
update event_members set status='accepted' where email='sam@other.test';
do $$ begin
  if (select count(*) from moments) <> 1 then raise exception 'FAIL accepted viewer cannot see moments'; end if;
  if (select count(*) from storage.objects) <> 1 then raise exception 'FAIL accepted viewer cannot see clip files'; end if;
  update moments set kept=false;  -- viewer: should affect 0 rows
  if (select count(*) from moments where kept=false) <> 0 then raise exception 'FAIL viewer edited moment'; end if;
  begin update event_members set role='editor' where email='sam@other.test'; raise exception 'FAIL viewer promoted self';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'PASS accepted viewer reads but cannot edit or promote';
end $$;

-- Jay promotes Sam; Sam can now edit.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111','jay@cutscene.test');
update event_members set role='editor' where email='sam@other.test';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','sam@other.test');
do $$ begin
  update moments set kept=false;
  if (select count(*) from moments where kept=false) <> 1 then raise exception 'FAIL editor cannot edit'; end if;
  delete from events; -- only owner may delete
  reset role; if (select count(*) from events) <> 1 then raise exception 'FAIL editor deleted event'; end if;
  raise notice 'PASS editor edits moments but cannot delete the event';
end $$;

-- Notifications: a big moment notifies the owner and accepted teammates, not strangers.
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111','jay@cutscene.test');
insert into moments (match_id,start_sec,end_sec,peak_sec,score,scan_score,category,reason,source) values ('bbbbbbbb-0000-0000-0000-000000000001',60,70,65,95,96,'Multi-kill','Ace to close the half','ai');
update matches set status='ended', ended_at=now() where id='bbbbbbbb-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from notifications) <> 3 then raise exception 'FAIL owner notifications: %', (select count(*) from notifications); end if;
  raise notice 'PASS owner notified of 2 big moments and the finished match, sees only their own';
end $$;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222','sam@other.test');
do $$ begin
  if (select count(*) from notifications) <> 2 then raise exception 'FAIL teammate notifications'; end if;
  raise notice 'PASS teammate notified, sees only their own';
end $$;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333','pat@other.test');
do $$ begin
  if (select count(*) from notifications) <> 0 then raise exception 'FAIL stranger notified'; end if;
  raise notice 'PASS stranger not notified';
end $$;
