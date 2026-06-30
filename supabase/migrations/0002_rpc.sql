-- Atomic vote: bump the counter and log the vote in one transaction, return the
-- new total. SECURITY DEFINER so it runs with the owner's rights, but EXECUTE is
-- revoked from anon/authenticated so only the Edge Function (service_role) can
-- call it — clients cannot invoke it directly with the public key.

create or replace function public.increment_vote(p_slug text, p_ip_hash text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total bigint;
begin
  update public.languages
     set total_votes = total_votes + 1
   where slug = p_slug
   returning total_votes into new_total;

  if new_total is null then
    raise exception 'unknown language: %', p_slug using errcode = 'no_data_found';
  end if;

  insert into public.vote_log (language_slug, ip_hash) values (p_slug, p_ip_hash);
  return new_total;
end;
$$;

revoke all on function public.increment_vote(text, text) from public, anon, authenticated;
grant execute on function public.increment_vote(text, text) to service_role;
