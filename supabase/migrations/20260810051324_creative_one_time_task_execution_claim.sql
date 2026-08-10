create or replace function public.claim_creative_one_time_task_execution(
  p_task_id uuid,
  p_token_sha256 text,
  p_execution_contract text
)
returns table (
  id uuid,
  status text,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.creative_production_tasks t
  set
    status = 'READY',
    metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
      'one_time_execution_consumed_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'one_time_execution_token_validated', true,
      'one_time_execution_requested_via', 'VERCEL_PRODUCTION_SMOKE_GATE',
      'one_time_execution_publication_authorized', false,
      'one_time_execution_media_regeneration_authorized', false
    ),
    updated_at = now()
  where t.id = p_task_id
    and t.status = 'WAITING'
    and coalesce(t.metadata->>'one_time_execution_contract', '') = p_execution_contract
    and coalesce(t.metadata->>'one_time_execution_token_sha256', '') = lower(p_token_sha256)
    and nullif(t.metadata->>'one_time_execution_consumed_at', '') is null
    and case
      when nullif(t.metadata->>'one_time_execution_expires_epoch_ms', '') is not null
        then (t.metadata->>'one_time_execution_expires_epoch_ms')::numeric > extract(epoch from now()) * 1000
      else false
    end
  returning t.id, t.status, t.metadata;
end;
$$;

revoke all on function public.claim_creative_one_time_task_execution(uuid, text, text) from public;
revoke all on function public.claim_creative_one_time_task_execution(uuid, text, text) from anon;
revoke all on function public.claim_creative_one_time_task_execution(uuid, text, text) from authenticated;
grant execute on function public.claim_creative_one_time_task_execution(uuid, text, text) to service_role;
