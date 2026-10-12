-- Only needed if you already ran an older schema.sql that included Apple Health.
-- Paste into Supabase → SQL Editor and press Run to remove those parts.
drop function if exists public.log_health(text, date, numeric, numeric, numeric);
drop table if exists public.health_days;
drop table if exists public.health_tokens;
