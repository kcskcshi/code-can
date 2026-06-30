-- ============================================================================
-- code-can → "LUNCH WARS": re-theme to lunch menus, switch votes to TENTHS,
-- and make attacking unlimited.
--
-- Paste into the Supabase SQL Editor and Run. THIS WIPES the current contenders
-- and re-seeds with food (the programming-language data is replaced).
--
--  * total_votes now counts TENTHS: a vote is +10 (=1.0), an attack is −1 (=0.1).
--  * attack_language takes p_amount (tenths) and has NO rate limit.
--  * attack_log is gone (no rate limiting → not needed).
-- ============================================================================

-- combat no longer rate-limits, so the log table is unnecessary
drop table if exists public.attack_log;

-- wipe old contenders + vote history, then reseed with menus
truncate public.languages, public.vote_log restart identity cascade;

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

-- ---- voting: now +10 (=1.0) per vote (keeps the per-IP rate limit) ----------
create or replace function public.cast_vote(p_slug text)
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
     set total_votes = total_votes + 10
   where slug = p_slug
   returning total_votes into new_total;
  if new_total is null then
    raise exception 'unknown menu: %', p_slug using errcode = 'no_data_found';
  end if;

  insert into public.vote_log (language_slug, ip_hash) values (p_slug, v_hash);
  return new_total;
end;
$$;

grant execute on function public.cast_vote(text) to anon, authenticated;

-- ---- combat: unlimited; removes p_amount tenths (default 1 = 0.1) -----------
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
