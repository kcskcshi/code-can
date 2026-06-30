-- Anon-callable voting with in-database rate limiting — no Edge Function required.
-- Trade-off vs the `vote` Edge Function: no Cloudflare Turnstile bot verification,
-- but per-IP rate limiting still applies. To restore stronger protection later,
-- deploy the Edge Function and point the frontend back at it.
--
-- The client IP is read from the gateway-supplied request headers (PostgREST
-- exposes them via the `request.headers` GUC); we never trust a client-sent IP.

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
