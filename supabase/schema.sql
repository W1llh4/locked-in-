-- Locked In: database setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then press Run.
-- Safe to run more than once.

-- ============ Your app data (one row per account) ============
create table if not exists public.user_data (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "Read own data" on public.user_data;
drop policy if exists "Insert own data" on public.user_data;
drop policy if exists "Update own data" on public.user_data;
drop policy if exists "Delete own data" on public.user_data;
create policy "Read own data"   on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own data" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own data" on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own data" on public.user_data for delete to authenticated using ((select auth.uid()) = user_id);

-- The server sets the timestamp, so devices with wrong clocks can't confuse syncing.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.user_data to authenticated;

-- ============ Apple Health (via iPhone Shortcut) ============
-- A secret token per account that lets your Shortcut send data without logging in.
create table if not exists public.health_tokens (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token      text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);

alter table public.health_tokens enable row level security;

drop policy if exists "Read own token" on public.health_tokens;
drop policy if exists "Create own token" on public.health_tokens;
drop policy if exists "Change own token" on public.health_tokens;
create policy "Read own token"   on public.health_tokens for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own token" on public.health_tokens for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Change own token" on public.health_tokens for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on public.health_tokens to authenticated;

-- One row per day of health data. Only the log_health function below writes here.
create table if not exists public.health_days (
  user_id     uuid not null references auth.users (id) on delete cascade,
  day         date not null,
  steps       integer,
  active_kcal numeric,
  sleep_hours numeric,
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.health_days enable row level security;

drop policy if exists "Read own health" on public.health_days;
create policy "Read own health" on public.health_days for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.health_days to authenticated;

-- Called by the iPhone Shortcut: POST /rest/v1/rpc/log_health
create or replace function public.log_health(
  p_token       text,
  p_date        date    default null,
  p_steps       numeric default null,
  p_active_kcal numeric default null,
  p_sleep_hours numeric default null
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  d   date := coalesce(p_date, current_date);
begin
  select user_id into uid from public.health_tokens where token = p_token;
  if uid is null then
    raise exception 'Invalid health token' using errcode = '28000';
  end if;

  insert into public.health_days as h (user_id, day, steps, active_kcal, sleep_hours)
  values (uid, d, round(p_steps)::integer, p_active_kcal, p_sleep_hours)
  on conflict (user_id, day) do update set
    steps       = coalesce(excluded.steps, h.steps),
    active_kcal = coalesce(excluded.active_kcal, h.active_kcal),
    sleep_hours = coalesce(excluded.sleep_hours, h.sleep_hours),
    updated_at  = now();

  return json_build_object('ok', true, 'date', d, 'steps', round(p_steps));
end $$;

revoke all on function public.log_health(text, date, numeric, numeric, numeric) from public;
grant execute on function public.log_health(text, date, numeric, numeric, numeric) to anon, authenticated;
