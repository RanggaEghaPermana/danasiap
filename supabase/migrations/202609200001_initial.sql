-- Financial state is a user-owned, versioned snapshot for the personal beta.
-- All writes pass through compare-and-swap; direct REST updates cannot bypass it.
create table public.app_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint snapshot_object check (jsonb_typeof(document) = 'object'),
  constraint snapshot_size check (octet_length(document::text) <= 2097152)
);

alter table public.app_snapshots enable row level security;
create policy "Read own snapshot" on public.app_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.app_snapshots from anon, authenticated;
grant select on public.app_snapshots to authenticated;

create function public.save_snapshot(p_document jsonb, p_expected_revision bigint)
returns setof public.app_snapshots
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_saved public.app_snapshots;
begin
  if v_uid is null then
    raise exception using errcode = 'PT401', message = 'Authentication required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception using errcode = 'PT400', message = 'Invalid expected revision';
  end if;
  if p_document is null or jsonb_typeof(p_document) <> 'object' or octet_length(p_document::text) > 2097152 then
    raise exception using errcode = 'PT400', message = 'Snapshot must be an object no larger than 2 MB';
  end if;
  if jsonb_typeof(p_document->'profile') is distinct from 'object'
    or jsonb_typeof(p_document->'transactions') is distinct from 'array'
    or jsonb_typeof(p_document->'needs') is distinct from 'array'
    or jsonb_typeof(p_document->'attendance') is distinct from 'array' then
    raise exception using errcode = 'PT400', message = 'Invalid financial snapshot structure';
  end if;
  if p_expected_revision = 0 then
    insert into public.app_snapshots(user_id, document, revision)
      values (v_uid, p_document, 1)
      on conflict (user_id) do nothing returning * into v_saved;
  else
    update public.app_snapshots
      set document = p_document, revision = revision + 1, updated_at = now()
      where user_id = v_uid and revision = p_expected_revision
      returning * into v_saved;
  end if;
  if v_saved.user_id is null then
    raise exception using errcode = 'PT409', message = 'Snapshot changed on another device';
  end if;
  return next v_saved;
end;
$$;
revoke all on function public.save_snapshot(jsonb, bigint) from public, anon;
grant execute on function public.save_snapshot(jsonb, bigint) to authenticated;

create table public.push_devices (
  token text primary key check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Jakarta',
  reminder_hour smallint not null default 7 check (reminder_hour between 0 and 23),
  include_amounts boolean not null default false,
  updated_at timestamptz not null default now()
);
create index push_devices_user_idx on public.push_devices(user_id);
alter table public.push_devices enable row level security;
create policy "Read own devices" on public.push_devices for select to authenticated using ((select auth.uid()) = user_id);
create policy "Remove own devices" on public.push_devices for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.push_devices from anon, authenticated;
grant select, delete on public.push_devices to authenticated;

create function public.register_push_token(
  p_token text,
  p_timezone text default 'Asia/Jakarta',
  p_reminder_hour integer default 7,
  p_include_amounts boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception using errcode = 'PT401', message = 'Authentication required'; end if;
  if p_token is null or length(p_token) > 255 or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then
    raise exception using errcode = 'PT400', message = 'Invalid Expo push token';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    or p_reminder_hour is null or p_reminder_hour not between 0 and 23 or p_include_amounts is null then
    raise exception using errcode = 'PT400', message = 'Invalid reminder preferences';
  end if;
  -- One physical device receives reminders for its most recently signed-in account.
  insert into public.push_devices(token, user_id, timezone, reminder_hour, include_amounts)
    values (p_token, v_uid, p_timezone, p_reminder_hour, p_include_amounts)
    on conflict (token) do update set user_id = v_uid, timezone = p_timezone,
      reminder_hour = p_reminder_hour, include_amounts = p_include_amounts, updated_at = now();
end;
$$;
revoke all on function public.register_push_token(text, text, integer, boolean) from public, anon;
grant execute on function public.register_push_token(text, text, integer, boolean) to authenticated;

-- A unique daily claim prevents duplicate sends from concurrent cron invocations.
create table public.reminder_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  local_date date not null,
  status text not null default 'sending' check (status in ('sending', 'accepted', 'delivered', 'failed')),
  ticket_id text,
  error_code text,
  created_at timestamptz not null default now(),
  unique (user_id, token, local_date)
);
alter table public.reminder_deliveries enable row level security;
revoke all on public.reminder_deliveries from anon, authenticated;
grant all on public.app_snapshots, public.push_devices, public.reminder_deliveries to service_role;
grant usage, select on sequence public.reminder_deliveries_id_seq to service_role;
