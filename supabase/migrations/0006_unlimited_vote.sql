-- ============================================================================
-- LUNCH WARS — make voting symmetric to attacking: unlimited, amount-based.
--
-- Paste into the Supabase SQL Editor and Run. No data is wiped.
--
-- Voting now mirrors attack_language: `cast_vote(p_slug, p_amount)` adds
-- `p_amount` tenths (default 10 = 1.0) with NO rate limit, so press-and-hold
-- "grow my menu" keeps pace with press-and-hold "smash a rival".
-- ============================================================================

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
