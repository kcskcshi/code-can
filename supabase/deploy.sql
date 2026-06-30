-- ============================================================================
-- LUNCH WARS (code-can) — complete one-shot setup for the Supabase SQL Editor.
-- Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- Everything the deployed app needs: schema + RLS + realtime + lunch-menu seed
-- + the `cast_vote` RPC and the unlimited `attack_language` combat RPC the
-- frontend calls directly. No Edge Function required. (Live chat needs no SQL —
-- it rides Realtime broadcast.)
--
-- Votes are stored in TENTHS: a vote is +10 (=1.0), an attack is −1 (=0.1).
-- Safe to re-run; idempotent. (To re-theme an existing DB, run
-- migrations/0005_food_theme.sql instead — it wipes the old contenders first.)
-- ============================================================================

-- ---- schema -----------------------------------------------------------------
create table if not exists public.languages (
  slug        text primary key,
  name        text not null,
  tag         text not null,
  color       text not null,
  total_votes bigint not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.vote_log (
  id            bigint generated always as identity primary key,
  language_slug text not null references public.languages(slug),
  ip_hash       text not null,
  created_at    timestamptz not null default now()
);

create index if not exists vote_log_ip_time_idx on public.vote_log (ip_hash, created_at desc);
create index if not exists vote_log_time_idx    on public.vote_log (created_at desc);

-- ---- RLS: clients may only READ languages -----------------------------------
alter table public.languages enable row level security;
alter table public.vote_log  enable row level security;

drop policy if exists "languages readable by anyone" on public.languages;
create policy "languages readable by anyone"
  on public.languages for select
  using (true);

-- ---- realtime: ship full old+new rows on UPDATE -----------------------------
alter table public.languages replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'languages'
  ) then
    alter publication supabase_realtime add table public.languages;
  end if;
end $$;

-- ---- seed (lunch menus; total_votes in tenths) ------------------------------
insert into public.languages (slug, name, tag, color, total_votes) values
  ('kimchi-stew','김치찌개','김치','#e2503f',520),
  ('jjajang','짜장면','짜장','#3b2a22',480),
  ('sushi','초밥','초밥','#f7a6b4',610),
  ('pizza','피자','피자','#e8893b',700),
  ('burger','햄버거','버거','#a9682f',450),
  ('bibimbap','비빔밥','비빔','#d8482e',390),
  ('ramen','라면','라면','#d23b2c',560),
  ('tteokbokki','떡볶이','떡볶','#e84a4a',430),
  ('pasta','파스타','파스타','#e0b14a',350),
  ('pho','쌀국수','쌀국','#cb9a5c',300),
  ('katsu','돈까스','돈까','#c98a4a',410),
  ('chicken','치킨','치킨','#d98b2b',660),
  ('curry','카레','카레','#d99a1f',280),
  ('taco','타코','타코','#e0a83c',240),
  ('dumpling','만두','만두','#e8d8a8',330),
  ('udon','우동','우동','#cdb98a',260),
  ('malatang','마라탕','마라','#b8323c',470),
  ('burrito','부리토','부리','#b9893f',200),
  ('sandwich','샌드위치','샌드','#d8b86a',290),
  ('naengmyeon','냉면','냉면','#5c8aa8',360),
  ('gyudon','규동','규동','#b0743a',220),
  ('padthai','팟타이','팟타','#dd8f4a',230),
  ('fries','감자튀김','감튀','#e8c44a',510),
  ('salad','샐러드','샐러','#6db84a',180),
  ('gimbap','김밥','김밥','#3f8f5c',340),
  ('steak','스테이크','스테','#8a3f33',380),
  ('sundubu','순두부','순두','#e26a4a',310),
  ('jeyuk','제육덮밥','제육','#cf4633',420)
on conflict (slug) do nothing;

-- ---- voting: UNLIMITED, adds p_amount tenths (default 10 = 1.0) -------------
-- Symmetric with attack_language so hold-to-grow keeps pace with hold-to-smash.
-- SECURITY DEFINER so it can write despite RLS.
drop function if exists public.cast_vote(text);
create or replace function public.cast_vote(p_slug text, p_amount int default 10)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total bigint;
  amt int := greatest(1, least(100, coalesce(p_amount, 10)));
begin
  update public.languages
     set total_votes = total_votes + amt
   where slug = p_slug
   returning total_votes into new_total;
  if new_total is null then
    raise exception 'unknown menu: %', p_slug using errcode = 'no_data_found';
  end if;
  return new_total;
end;
$$;

grant execute on function public.cast_vote(text, int) to anon, authenticated;

-- ---- combat: UNLIMITED attack that removes p_amount tenths (default 1=0.1) ---
-- No rate limit (attacking is meant to be spammed), so no attack_log needed.
drop function if exists public.attack_language(text);
create or replace function public.attack_language(p_target text, p_amount int default 1)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total bigint;
  dmg int := greatest(1, least(100, coalesce(p_amount, 1)));
begin
  update public.languages
     set total_votes = greatest(0, total_votes - dmg)
   where slug = p_target
   returning total_votes into new_total;
  if new_total is null then
    raise exception 'unknown menu: %', p_target using errcode = 'no_data_found';
  end if;
  return new_total;
end;
$$;

grant execute on function public.attack_language(text, int) to anon, authenticated;
