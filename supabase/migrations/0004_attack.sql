-- Combat: an anon-callable "attack" that removes a few votes from a rival
-- language. Mirror of `cast_vote` (migration 0003) but it *decrements*, clamped
-- at zero, with a stricter rate limit. Like voting, the client IP is derived
-- server-side from gateway headers — never trusted from the client.
--
-- Live chat needs NO SQL: it rides Supabase Realtime broadcast (ephemeral).

create table if not exists public.attack_log (
  id          bigint generated always as identity primary key,
  target_slug text not null references public.languages(slug),
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists attack_log_ip_time_idx on public.attack_log (ip_hash, created_at desc);

-- Deny-by-default: enable RLS with no client policies, so anon/authenticated
-- can neither read nor write attack_log directly. The RPC (SECURITY DEFINER)
-- is the only writer.
alter table public.attack_log enable row level security;

create or replace function public.attack_language(p_target text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip      text;
  v_hash    text;
  v_recent  int;
  new_total bigint;
  damage    int := 3;
begin
  v_ip := split_part(
    coalesce(
      nullif(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
      'local'
    ), ',', 1);
  v_hash := md5('code-can:' || v_ip);

  -- rate limit: at most 3 attacks per 15 seconds per IP
  select count(*) into v_recent
    from public.attack_log
   where ip_hash = v_hash
     and created_at > now() - interval '15 seconds';
  if v_recent >= 3 then
    raise exception 'rate_limited' using errcode = 'check_violation';
  end if;

  update public.languages
     set total_votes = greatest(0, total_votes - damage)
   where slug = p_target
   returning total_votes into new_total;
  if new_total is null then
    raise exception 'unknown language: %', p_target using errcode = 'no_data_found';
  end if;

  insert into public.attack_log (target_slug, ip_hash) values (p_target, v_hash);
  return new_total;
end;
$$;

grant execute on function public.attack_language(text) to anon, authenticated;
