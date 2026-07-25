-- AVANTIQO CREATIVE JOBLESS PUBLISH RECONCILIATION
-- A synchronous connector may accept a publication and then lose the response.
-- Such executions have no provider job id and must never be reposted blindly.
-- This replacement permits a terminal reconciliation lease only when the
-- execution is already RECONCILIATION_REQUIRED and has no stored job identity.

begin;

create or replace function public.claim_creative_publish_reconciliation(
  p_execution_id uuid,
  p_organization_id uuid,
  p_provider_id text,
  p_provider_job_id text,
  p_worker_id text,
  p_lease_seconds integer default 900
)
returns setof public.creative_asset_nodes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(nullif(btrim(coalesce(p_provider_id, '')), ''));
  v_job text := nullif(btrim(coalesce(p_provider_job_id, '')), '');
  v_worker text := nullif(btrim(coalesce(p_worker_id, '')), '');
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 900), 3600));
  v_token uuid := gen_random_uuid();
begin
  if p_execution_id is null or p_organization_id is null then
    raise exception 'execution_id and organization_id required';
  end if;
  if v_provider is null then
    raise exception 'provider_id required';
  end if;
  if v_worker is null then
    raise exception 'worker_id required';
  end if;

  return query
  update public.creative_asset_nodes execution
  set metadata = (
        coalesce(execution.metadata, '{}'::jsonb)
          - 'reconciliation_lease_token'
          - 'reconciliation_leased_by'
          - 'reconciliation_lease_expires_at'
      ) || jsonb_build_object(
        'reconciliation_lease_token', v_token::text,
        'reconciliation_leased_by', v_worker,
        'reconciliation_lease_expires_at', (now() + make_interval(secs => v_lease_seconds))::text,
        'reconciliation_claimed_at', now()::text,
        'reconciliation_identity_mode', case
          when v_job is null then 'EXECUTION_PROVIDER_TERMINAL_EVIDENCE'
          else 'PROVIDER_JOB'
        end
      ),
      updated_at = now()
  where execution.id = p_execution_id
    and execution.organization_id = p_organization_id
    and execution.type = 'PUBLISH_EXECUTION'
    and execution.metadata->>'execution_status' in (
      'PENDING_PROVIDER',
      'RECONCILIATION_REQUIRED'
    )
    and lower(coalesce(execution.metadata->>'provider_id', '')) = v_provider
    and (
      (
        v_job is not null
        and coalesce(execution.metadata->>'provider_job_id', '') = v_job
      )
      or (
        v_job is null
        and execution.metadata->>'execution_status' = 'RECONCILIATION_REQUIRED'
        and nullif(execution.metadata->>'provider_job_id', '') is null
      )
    )
    and (
      execution.metadata->>'reconciliation_lease_token' is null
      or nullif(execution.metadata->>'reconciliation_lease_expires_at', '')::timestamptz <= now()
    )
  returning execution.*;
end;
$$;

revoke all on function public.claim_creative_publish_reconciliation(
  uuid, uuid, text, text, text, integer
) from public, anon, authenticated;

grant execute on function public.claim_creative_publish_reconciliation(
  uuid, uuid, text, text, text, integer
) to service_role;

commit;
