-- code-can — core schema, RLS, seed.
-- Security model: clients may ONLY read languages. All writes go through the
-- `vote` Edge Function (service_role), which bypasses RLS. There are deliberately
-- no INSERT/UPDATE/DELETE policies for anon/authenticated, so those are blocked.

create table if not exists public.languages (
  slug        text primary key,
  name        text not null,
  tag         text not null,
  color       text not null,
  total_votes bigint not null default 0,
  created_at  timestamptz not null default now()
);

-- One row per accepted vote: powers rate limiting and the recent-activity feed.
create table if not exists public.vote_log (
  id            bigint generated always as identity primary key,
  language_slug text not null references public.languages(slug),
  ip_hash       text not null,
  created_at    timestamptz not null default now()
);

create index if not exists vote_log_ip_time_idx on public.vote_log (ip_hash, created_at desc);
create index if not exists vote_log_time_idx    on public.vote_log (created_at desc);

-- Deny-by-default.
alter table public.languages enable row level security;
alter table public.vote_log  enable row level security;

-- Public leaderboard read.
drop policy if exists "languages readable by anyone" on public.languages;
create policy "languages readable by anyone"
  on public.languages for select
  using (true);
-- (No policies on vote_log => clients cannot read or write it.)

-- Realtime: ship full old+new rows on UPDATE so clients can compute vote deltas.
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

-- Seed the contenders (mirror of src/languages.ts).
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
