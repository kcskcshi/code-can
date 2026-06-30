-- ============================================================================
-- LUNCH WARS — persist chat for the current round only ("하루치만 보존").
-- Paste into the Supabase SQL Editor and Run. Chat was ephemeral (Realtime
-- broadcast only); now it lives in `messages` so a refresh keeps today's log.
--
-- Every KST midnight the first visitor triggers roll_round_if_due(): just like
-- votes reset, yesterday's (and older) chat is deleted, leaving only today's.
-- ============================================================================

-- persistent chat log (publicly readable; writes go through post_message)
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  nick       text not null,
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_time_idx on public.messages (created_at desc);

alter table public.messages enable row level security;
drop policy if exists "messages readable by anyone" on public.messages;
create policy "messages readable by anyone" on public.messages for select using (true);

-- store a chat line (SECURITY DEFINER so it writes despite read-only RLS;
-- trims/clamps like the client does — 200 = chatPanel MAX_LEN).
create or replace function public.post_message(p_nick text, p_text text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  n  text := nullif(btrim(p_nick), '');
  t  text := nullif(btrim(p_text), '');
  ts timestamptz;
begin
  if n is null or t is null then
    return null;
  end if;
  insert into public.messages (nick, text)
    values (left(n, 40), left(t, 200))
    returning created_at into ts;
  return ts;
end;
$$;

grant execute on function public.post_message(text, text) to anon, authenticated;

-- roll the round if a new KST day has started (idempotent, lock-guarded).
-- Same as 0008 plus a chat sweep: drop everything older than today (KST).
create or replace function public.roll_round_if_due()
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  d     date;
  today date := (now() at time zone 'Asia/Seoul')::date;
  w     record;
begin
  select round_date into d from public.app_state where id = 1 for update;
  if d is null then
    insert into public.app_state (id, round_date) values (1, today)
      on conflict (id) do nothing;
    return today;
  end if;
  if d < today then
    -- archive the menu that led when the day ended
    select slug, name, total_votes into w
      from public.languages order by total_votes desc limit 1;
    if w.slug is not null then
      insert into public.winners (round_date, slug, name, votes)
        values (d, w.slug, w.name, w.total_votes)
        on conflict (round_date) do nothing;
    end if;
    -- fresh race: reset every menu to its baseline
    update public.languages set total_votes = base_votes;
    -- fresh chat: keep only today's lines
    delete from public.messages where (created_at at time zone 'Asia/Seoul')::date < today;
    update public.app_state set round_date = today where id = 1;
  end if;
  return today;
end;
$$;

grant execute on function public.roll_round_if_due() to anon, authenticated;
