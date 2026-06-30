-- ============================================================================
-- LUNCH WARS — daily rounds + hall of fame.
-- Paste into the Supabase SQL Editor and Run. No data is wiped; today's totals
-- become each menu's reset baseline (base_votes).
--
-- Every day at KST midnight the first visitor triggers roll_round_if_due():
-- yesterday's #1 menu is archived into `winners`, and every menu's total_votes
-- resets to its base_votes so a fresh lunch race starts.
-- ============================================================================

-- reset baseline per menu (defaults to today's totals)
alter table public.languages add column if not exists base_votes bigint not null default 0;
update public.languages set base_votes = total_votes where base_votes = 0;

-- single-row table holding the current round's date (KST)
create table if not exists public.app_state (
  id         int primary key default 1,
  round_date date not null default (now() at time zone 'Asia/Seoul')::date,
  constraint app_state_singleton check (id = 1)
);
insert into public.app_state (id) values (1) on conflict (id) do nothing;

-- archived daily winners (publicly readable for the hall of fame)
create table if not exists public.winners (
  round_date date primary key,
  slug       text not null,
  name       text not null,
  votes      bigint not null,
  created_at timestamptz not null default now()
);
alter table public.winners enable row level security;
drop policy if exists "winners readable by anyone" on public.winners;
create policy "winners readable by anyone" on public.winners for select using (true);

-- roll the round if a new KST day has started (idempotent, lock-guarded)
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
      from public.languages
     order by total_votes desc
     limit 1;
    if w.slug is not null then
      insert into public.winners (round_date, slug, name, votes)
        values (d, w.slug, w.name, w.total_votes)
        on conflict (round_date) do nothing;
    end if;
    -- fresh race: reset every menu to its baseline
    update public.languages set total_votes = base_votes;
    update public.app_state set round_date = today where id = 1;
  end if;

  return today;
end;
$$;

grant execute on function public.roll_round_if_due() to anon, authenticated;
