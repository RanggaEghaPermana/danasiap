-- Standalone PostgreSQL security test, intentionally run only in a disposable cluster.
-- Run from the repo: pg_virtualenv psql -X -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');

\ir ../migrations/202609200001_initial.sql

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select revision from public.save_snapshot('{"profile":{},"transactions":[],"needs":[],"attendance":[]}', 0);
select revision from public.save_snapshot('{"profile":{"name":"First account"},"transactions":[],"needs":[],"attendance":[]}', 1);
do $$ begin
  if (select revision from public.app_snapshots) <> 2 then raise exception 'Revision was not incremented'; end if;
  begin
    perform public.save_snapshot('{"profile":{},"transactions":[],"needs":[],"attendance":[]}', 1);
    raise exception 'STALE_WRITE_WAS_ALLOWED';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.save_snapshot('{"profile":{},"transactions":[],"needs":[],"attendance":[]}', 0);
    raise exception 'DUPLICATE_CREATE_WAS_ALLOWED';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    update public.app_snapshots set revision = 99;
    raise exception 'DIRECT_UPDATE_WAS_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_snapshot('{"profile":{}}', 2);
    raise exception 'INVALID_DOCUMENT_WAS_ALLOWED';
  exception when sqlstate 'PT400' then null;
  end;
end $$;
select public.register_push_token('ExpoPushToken[test-device_1]', 'Asia/Jakarta', 7, false);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$ begin
  if exists (select 1 from public.app_snapshots) then raise exception 'CROSS_ACCOUNT_READ_WAS_ALLOWED'; end if;
  if exists (select 1 from public.push_devices) then raise exception 'CROSS_ACCOUNT_DEVICE_READ_WAS_ALLOWED'; end if;
end $$;
select revision from public.save_snapshot('{"profile":{"name":"Second account"},"transactions":[],"needs":[],"attendance":[]}', 0);
select public.register_push_token('ExpoPushToken[test-device_1]', 'Asia/Jakarta', 8, false);
do $$ begin
  if (select count(*) from public.app_snapshots) <> 1 then raise exception 'Account isolation failed'; end if;
  if (select user_id from public.push_devices) <> auth.uid() then raise exception 'Device ownership did not change'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$ begin
  if exists (select 1 from public.push_devices) then raise exception 'Previous account still owns device'; end if;
  if (select document->'profile'->>'name' from public.app_snapshots) <> 'First account' then raise exception 'Cross-account write occurred'; end if;
end $$;

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform * from public.app_snapshots;
    raise exception 'ANONYMOUS_READ_WAS_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_snapshot('{"profile":{},"transactions":[],"needs":[],"attendance":[]}', 0);
    raise exception 'ANONYMOUS_WRITE_WAS_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'All isolation, revision, and auth checks passed.' as result;
