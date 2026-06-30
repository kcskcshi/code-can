-- ============================================================================
-- code-can — complete one-shot setup for the Supabase SQL Editor.
-- Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- This is everything the deployed app needs: schema + RLS + realtime + seed +
-- the `cast_vote` RPC the frontend calls directly. No Edge Function required.
-- (Combines migrations 0001 + 0002 + 0003. Safe to re-run; idempotent.)
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

-- ---- seed -------------------------------------------------------------------
insert into public.languages (slug, name, tag, color) values
  ('javascript','JavaScript','JS','#f7df1e'),
  ('typescript','TypeScript','TS','#3178c6'),
  ('python','Python','PY','#4b8bbe'),
  ('rust','Rust','RS','#ce422b'),
  ('go','Go','GO','#00add8'),
  ('java','Java','JAV','#e76f00'),
  ('c','C','C','#5c6bc0'),
  ('cpp','C++','C++','#00599c'),
  ('csharp','C#','C#','#9b4f96'),
  ('ruby','Ruby','RB','#cc342d'),
  ('php','PHP','PHP','#777bb4'),
  ('swift','Swift','SW','#fa7343'),
  ('kotlin','Kotlin','KT','#7f52ff'),
  ('dart','Dart','DRT','#0175c2'),
  ('scala','Scala','SC','#dc322f'),
  ('haskell','Haskell','HS','#5e5086'),
  ('elixir','Elixir','EX','#6e4a7e'),
  ('clojure','Clojure','CLJ','#5881d8'),
  ('lua','Lua','LUA','#000080'),
  ('perl','Perl','PL','#39457e'),
  ('r','R','R','#276dc3'),
  ('julia','Julia','JL','#9558b2'),
  ('zig','Zig','ZIG','#f7a41d'),
  ('elm','Elm','ELM','#60b5cc'),
  ('ocaml','OCaml','ML','#ec670f'),
  ('erlang','Erlang','ERL','#a90533'),
  ('fsharp','F#','F#','#378bba'),
  ('bash','Bash','SH','#89e051'),
  ('sql','SQL','SQL','#e38c00'),
  ('cobol','COBOL','CBL','#1f6f8b')
on conflict (slug) do nothing;

-- ---- anon-callable voting with in-database rate limiting --------------------
-- SECURITY DEFINER so it can write despite RLS; the client IP is read from the
-- gateway-supplied request headers server-side (never trusted from the client).
create or replace function public.cast_vote(p_slug text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip     text;
  v_hash   text;
  v_recent int;
  new_total bigint;
begin
  v_ip := split_part(
    coalesce(
      nullif(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
      'local'
    ), ',', 1);
  v_hash := md5('code-can:' || v_ip);

  -- rate limit: at most 5 votes per 10 seconds per IP
  select count(*) into v_recent
    from public.vote_log
   where ip_hash = v_hash
     and created_at > now() - interval '10 seconds';
  if v_recent >= 5 then
    raise exception 'rate_limited' using errcode = 'check_violation';
  end if;

  update public.languages
     set total_votes = total_votes + 1
   where slug = p_slug
   returning total_votes into new_total;
  if new_total is null then
    raise exception 'unknown language: %', p_slug using errcode = 'no_data_found';
  end if;

  insert into public.vote_log (language_slug, ip_hash) values (p_slug, v_hash);
  return new_total;
end;
$$;

grant execute on function public.cast_vote(text) to anon, authenticated;
