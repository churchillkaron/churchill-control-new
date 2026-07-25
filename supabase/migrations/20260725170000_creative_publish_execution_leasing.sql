-- AVANTIQO CREATIVE PUBLISH EXECUTION LEASING
-- Claims a publish command before any external connector call and reconciles
-- asynchronous provider evidence exactly once. Expired submissions are never
-- blindly reposted; they remain blocked for reconciliation.

begin;

create or replace function public.claim_creative_publish_command(
  p_command_id uuid,
  p_organization_id uuid,
  p_execution_identity text,
  p_worker_id text,
  p_lease_seconds integer default 900
)
returns setof public.creative_asset_nodes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity text := nullif(btrim(coalesce(p_execution_identity, '')), '');
  v_worker text := nullif(btrim(coalesce(p_worker_id, '')), '');
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 900), 3600));
  v_token uuid := gen_random_uuid();
begin
  if p_command_id is null or p_organization_id is null then
    raise exception 'command_id and organization_id required';
  end if;
  if v_identity is null then
    raise exception 'execution_identity required';
  end if;
  if v_worker is null then
    raise exception 'worker_id required';
  end if;

  return query
  update public.creative_asset_nodes command
  set metadata = (
        coalesce(command.metadata, '{}'::jsonb)
          - 'execution_lease_token'
          - 'execution_leased_by'
          - 'execution_lease_expires_at'
      ) || jsonb_build_object(
        'execution_status', 'CONNECTOR_EXECUTING',
        'publish_execution_identity', v_identity,
        'connector_submission_state', 'CLAIMED',
        'connector_submission_idempotency_key', v_identity,
        'execution_lease_token', v_token::text,
        'execution_leased_by', v_worker,
        'execution_lease_expires_at', (now() + make_interval(secs => v_lease_seconds))::text,
        'execution_claimed_at', now()::text
      ),
      updated_at = now()
  where command.id = p_command_id
    and command.organization_id = p_organization_id
    and command.type = 'PUBLISH_COMMAND'
    and coalesce(command.metadata->>'execution_status', '') = 'PENDING_CONNECTOR'
    and not exists (
      select 1
      from public.creative_asset_nodes execution
      where execution.organization_id = p_organization_id
        and execution.type = 'PUBLISH_EXECUTION'
        and execution.metadata->>'publish_execution_identity' = v_identity
    )
  returning command.*;
end;
$$;

create or replace function public.settle_creative_publish_command(
  p_command_id uuid,
  p_organization_id uuid,
  p_execution_identity text,
  p_lease_token uuid,
  p_execution_asset_node_id uuid,
  p_status text,
  p_evidence jsonb default '{}'::jsonb
)
returns setof public.creative_asset_nodes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_identity text := nullif(btrim(coalesce(p_execution_identity, '')), '');
begin
  if v_status not in (
    'PENDING_PROVIDER',
    'COMPLETED',
    'FAILED',
    'RECONCILIATION_REQUIRED'
  ) then
    raise exception 'INVALID_PUBLISH_COMMAND_STATUS:%', v_status;
  end if;
  if p_lease_token is null then
    raise exception 'lease_token required';
  end if;
  if p_execution_asset_node_id is null then
    raise exception 'execution_asset_node_id required';
  end if;
  if v_identity is null then
    raise exception 'execution_identity required';
  end if;

  return query
  update public.creative_asset_nodes command
  set metadata = (
        coalesce(command.metadata, '{}'::jsonb)
          - 'execution_lease_token'
          - 'execution_leased_by'
          - 'execution_lease_expires_at'
      ) || coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object(
        'execution_status', v_status,
        'publish_execution_identity', v_identity,
        'publish_execution_asset_node_id', p_execution_asset_node_id,
        'execution_settled_at', now()::text
      ),
      updated_at = now()
  where command.id = p_command_id
    and command.organization_id = p_organization_id
    and command.type = 'PUBLISH_COMMAND'
    and command.metadata->>'execution_status' = 'CONNECTOR_EXECUTING'
    and command.metadata->>'publish_execution_identity' = v_identity
    and command.metadata->>'execution_lease_token' = p_lease_token::text
  returning command.*;
end;
$$;

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
  if v_provider is null or v_job is null then
    raise exception 'provider_id and provider_job_id required';
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
        'reconciliation_claimed_at', now()::text
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
    and coalesce(execution.metadata->>'provider_job_id', '') = v_job
    and (
      execution.metadata->>'reconciliation_lease_token' is null
      or nullif(execution.metadata->>'reconciliation_lease_expires_at', '')::timestamptz <= now()
    )
  returning execution.*;
end;
$$;

create or replace function public.record_creative_publish_progress(
  p_execution_id uuid,
  p_organization_id uuid,
  p_provider_id text,
  p_provider_job_id text,
  p_provider_status text,
  p_evidence jsonb default '{}'::jsonb
)
returns setof public.creative_asset_nodes
language sql
security definer
set search_path = public
as $$
  update public.creative_asset_nodes execution
  set metadata = coalesce(execution.metadata, '{}'::jsonb)
        || coalesce(p_evidence, '{}'::jsonb)
        || jsonb_build_object(
          'provider_status', nullif(btrim(coalesce(p_provider_status, '')), ''),
          'provider_progress_received_at', now()::text
        ),
      updated_at = now()
  where execution.id = p_execution_id
    and execution.organization_id = p_organization_id
    and execution.type = 'PUBLISH_EXECUTION'
    and execution.metadata->>'execution_status' in (
      'PENDING_PROVIDER',
      'RECONCILIATION_REQUIRED'
    )
    and lower(coalesce(execution.metadata->>'provider_id', '')) = lower(btrim(coalesce(p_provider_id, '')))
    and coalesce(execution.metadata->>'provider_job_id', '') = btrim(coalesce(p_provider_job_id, ''))
    and execution.metadata->>'reconciliation_lease_token' is null
  returning execution.*;
$$;

create or replace function public.settle_creative_publish_reconciliation(
  p_execution_id uuid,
  p_organization_id uuid,
  p_lease_token uuid,
  p_status text,
  p_evidence jsonb default '{}'::jsonb
)
returns setof public.creative_asset_nodes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_command_id uuid;
  v_execution public.creative_asset_nodes%rowtype;
begin
  if v_status not in ('COMPLETED', 'FAILED') then
    raise exception 'INVALID_PUBLISH_RECONCILIATION_STATUS:%', v_status;
  end if;
  if p_lease_token is null then
    raise exception 'lease_token required';
  end if;

  update public.creative_asset_nodes execution
  set status = case when v_status = 'COMPLETED' then 'APPROVED' else 'REJECTED' end,
      metadata = (
        coalesce(execution.metadata, '{}'::jsonb)
          - 'reconciliation_lease_token'
          - 'reconciliation_leased_by'
          - 'reconciliation_lease_expires_at'
      ) || coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object(
        'execution_status', v_status,
        'reconciliation_settled_at', now()::text,
        'completed_at', now()::text
      ),
      updated_at = now()
  where execution.id = p_execution_id
    and execution.organization_id = p_organization_id
    and execution.type = 'PUBLISH_EXECUTION'
    and execution.metadata->>'execution_status' in (
      'PENDING_PROVIDER',
      'RECONCILIATION_REQUIRED'
    )
    and execution.metadata->>'reconciliation_lease_token' = p_lease_token::text
  returning execution.* into v_execution;

  if v_execution.id is null then
    return;
  end if;

  v_command_id := v_execution.parent_asset_node_id;

  update public.creative_asset_nodes command
  set metadata = coalesce(command.metadata, '{}'::jsonb)
        || coalesce(p_evidence, '{}'::jsonb)
        || jsonb_build_object(
          'execution_status', v_status,
          'publish_execution_asset_node_id', v_execution.id,
          'execution_settled_at', now()::text
        ),
      updated_at = now()
  where command.id = v_command_id
    and command.organization_id = p_organization_id
    and command.type = 'PUBLISH_COMMAND';

  return next v_execution;
end;
$$;

revoke all on function public.claim_creative_publish_command(
  uuid, uuid, text, text, integer
) from public, anon, authenticated;
revoke all on function public.settle_creative_publish_command(
  uuid, uuid, text, uuid, uuid, text, jsonb
) from public, anon, authenticated;
revoke all on function public.claim_creative_publish_reconciliation(
  uuid, uuid, text, text, text, integer
) from public, anon, authenticated;
revoke all on function public.record_creative_publish_progress(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.settle_creative_publish_reconciliation(
  uuid, uuid, uuid, text, jsonb
) from public, anon, authenticated;

grant execute on function public.claim_creative_publish_command(
  uuid, uuid, text, text, integer
) to service_role;
grant execute on function public.settle_creative_publish_command(
  uuid, uuid, text, uuid, uuid, text, jsonb
) to service_role;
grant execute on function public.claim_creative_publish_reconciliation(
  uuid, uuid, text, text, text, integer
) to service_role;
grant execute on function public.record_creative_publish_progress(
  uuid, uuid, text, text, text, jsonb
) to service_role;
grant execute on function public.settle_creative_publish_reconciliation(
  uuid, uuid, uuid, text, jsonb
) to service_role;

commit;
