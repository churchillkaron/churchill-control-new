begin;

create or replace function public.claim_developer_api_rate_limit(
  p_credential_id uuid,
  p_limit integer default 120
)
returns table(allowed boolean, request_count integer, window_start timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if p_limit < 1 or p_limit > 10000 then
    raise exception 'DEVELOPER_RATE_LIMIT_INVALID';
  end if;
  insert into public.developer_api_rate_buckets as buckets(
    credential_id, window_start, request_count
  )
  values (p_credential_id, v_window, 1)
  on conflict on constraint developer_api_rate_buckets_pkey
  do update set request_count = buckets.request_count + 1
  returning buckets.request_count into v_count;
  return query select (v_count <= p_limit), v_count, v_window;
end;
$$;

revoke all on function public.claim_developer_api_rate_limit(uuid,integer) from public;
revoke all on function public.claim_developer_api_rate_limit(uuid,integer) from anon;
revoke all on function public.claim_developer_api_rate_limit(uuid,integer) from authenticated;
grant execute on function public.claim_developer_api_rate_limit(uuid,integer) to service_role;

commit;
