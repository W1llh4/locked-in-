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
