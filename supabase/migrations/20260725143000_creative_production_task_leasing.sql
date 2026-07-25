-- AVANTIQO CREATIVE PRODUCTION TASK LEASING
-- Prevents duplicate provider submissions and duplicate generated asset nodes.

begin;

alter table public.creative_production_tasks
  add column if not exists lease_token uuid,
  add column if not exists leased_by text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_attempt_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creative_production_tasks_attempt_count_check'
      and conrelid = 'public.creative_production_tasks'::regclass
  ) then
    alter table public.creative_production_tasks
      add constraint creative_production_tasks_attempt_count_check
      check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts);
  end if;
end;
$$;

create index if not exists creative_production_tasks_claim_idx
  on public.creative_production_tasks (
    organization_id,
    creative_project_id,
    status,
    next_attempt_at,
    lease_expires_at,
    priority,
    created_at
  );

do $$
begin
  if exists (
    select production_task_id
    from public.creative_asset_nodes
    where production_task_id is not null
    group by production_task_id
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_PRODUCTION_TASK_ASSET_NODES_REQUIRE_RECONCILIATION';
  end if;
end;
$$;

create unique index if not exists creative_asset_nodes_production_task_uidx
  on public.creative_asset_nodes (production_task_id)
  where production_task_id is not null;

create or replace function public.claim_creative_production_task(
  p_task_id uuid,
  p_organization_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 900
)
returns setof public.creative_production_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 900), 3600));
begin
  if p_task_id is null or p_organization_id is null then
    raise exception 'task_id and organization_id required';
  end if;
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'worker_id required';
  end if;

  return query
  update public.creative_production_tasks task
  set status = 'RUNNING',
      lease_token = gen_random_uuid(),
      leased_by = btrim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      last_heartbeat_at = now(),
      attempt_count = task.attempt_count + 1,
      next_attempt_at = null,
      timing = coalesce(task.timing, '{}'::jsonb) || jsonb_build_object(
        'started_at', coalesce(task.timing->>'started_at', now()::text)
      ),
      updated_at = now()
  where task.id = p_task_id
    and task.organization_id = p_organization_id
    and task.attempt_count < task.max_attempts
    and (task.next_attempt_at is null or task.next_attempt_at <= now())
    and (
      task.status in ('PLANNED', 'WAITING', 'READY')
      or (
        task.status = 'RUNNING'
        and task.lease_expires_at is not null
        and task.lease_expires_at <= now()
        and coalesce(task.output->>'provider_job_id', '') = ''
      )
    )
  returning task.*;
end;
$$;

create or replace function public.heartbeat_creative_production_task(
  p_task_id uuid,
  p_organization_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 900
)
returns setof public.creative_production_tasks
language sql
security definer
set search_path = public
as $$
  update public.creative_production_tasks task
  set lease_expires_at = now() + make_interval(
        secs => greatest(30, least(coalesce(p_lease_seconds, 900), 3600))
      ),
      last_heartbeat_at = now(),
      updated_at = now()
  where task.id = p_task_id
    and task.organization_id = p_organization_id
    and task.status = 'RUNNING'
    and task.lease_token = p_lease_token
  returning task.*;
$$;

create or replace function public.submit_creative_production_task(
  p_task_id uuid,
  p_organization_id uuid,
  p_lease_token uuid,
  p_provider_id text default null,
  p_output jsonb default '{}'::jsonb
)
returns setof public.creative_production_tasks
language sql
security definer
set search_path = public
as $$
  update public.creative_production_tasks task
  set status = 'RUNNING',
      provider_id = coalesce(nullif(btrim(coalesce(p_provider_id, '')), ''), task.provider_id),
      output = coalesce(task.output, '{}'::jsonb) || coalesce(p_output, '{}'::jsonb),
      lease_token = null,
      leased_by = null,
      lease_expires_at = null,
      last_heartbeat_at = null,
      updated_at = now()
  where task.id = p_task_id
    and task.organization_id = p_organization_id
    and task.status = 'RUNNING'
    and task.lease_token = p_lease_token
  returning task.*;
$$;

create or replace function public.finalize_creative_production_task(
  p_task_id uuid,
  p_organization_id uuid,
  p_status text,
  p_output jsonb default '{}'::jsonb,
  p_error text default null,
  p_lease_token uuid default null
)
returns setof public.creative_production_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(btrim(coalesce(p_status, '')));
begin
  if v_status not in ('COMPLETED', 'FAILED', 'SKIPPED') then
    raise exception 'INVALID_TERMINAL_TASK_STATUS:%', v_status;
  end if;

  return query
  with changed as (
    update public.creative_production_tasks task
    set status = v_status,
        output = coalesce(task.output, '{}'::jsonb) || coalesce(p_output, '{}'::jsonb),
        error = case when v_status = 'COMPLETED' then null else p_error end,
        timing = coalesce(task.timing, '{}'::jsonb) || jsonb_build_object(
          'completed_at', now()::text
        ),
        lease_token = null,
        leased_by = null,
        lease_expires_at = null,
        last_heartbeat_at = null,
        next_attempt_at = null,
        updated_at = now()
    where task.id = p_task_id
      and task.organization_id = p_organization_id
      and task.status not in ('COMPLETED', 'FAILED', 'SKIPPED')
      and (
        p_lease_token is null
        or task.lease_token = p_lease_token
        or task.lease_token is null
      )
    returning task.*
  )
  select * from changed
  union all
  select task.*
  from public.creative_production_tasks task
  where task.id = p_task_id
    and task.organization_id = p_organization_id
    and not exists (select 1 from changed)
  limit 1;
end;
$$;

create or replace function public.fail_creative_production_task_attempt(
  p_task_id uuid,
  p_organization_id uuid,
  p_lease_token uuid,
  p_error text,
  p_retryable boolean default true,
  p_retry_delay_seconds integer default 30
)
returns setof public.creative_production_tasks
language sql
security definer
set search_path = public
as $$
  update public.creative_production_tasks task
  set status = case
        when coalesce(p_retryable, true) and task.attempt_count < task.max_attempts
          then 'READY'
        else 'FAILED'
      end,
      error = p_error,
      next_attempt_at = case
        when coalesce(p_retryable, true) and task.attempt_count < task.max_attempts
          then now() + make_interval(
            secs => greatest(1, least(coalesce(p_retry_delay_seconds, 30), 3600))
          )
        else null
      end,
      timing = case
        when coalesce(p_retryable, true) and task.attempt_count < task.max_attempts
          then coalesce(task.timing, '{}'::jsonb)
        else coalesce(task.timing, '{}'::jsonb) || jsonb_build_object(
          'completed_at', now()::text
        )
      end,
      lease_token = null,
      leased_by = null,
      lease_expires_at = null,
      last_heartbeat_at = null,
      updated_at = now()
  where task.id = p_task_id
    and task.organization_id = p_organization_id
    and task.status = 'RUNNING'
    and task.lease_token = p_lease_token
  returning task.*;
$$;

revoke all on function public.claim_creative_production_task(uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_creative_production_task(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.submit_creative_production_task(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_creative_production_task(uuid, uuid, text, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_creative_production_task_attempt(uuid, uuid, uuid, text, boolean, integer)
  from public, anon, authenticated;

grant execute on function public.claim_creative_production_task(uuid, uuid, text, integer)
  to service_role;
grant execute on function public.heartbeat_creative_production_task(uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.submit_creative_production_task(uuid, uuid, uuid, text, jsonb)
  to service_role;
grant execute on function public.finalize_creative_production_task(uuid, uuid, text, jsonb, text, uuid)
  to service_role;
grant execute on function public.fail_creative_production_task_attempt(uuid, uuid, uuid, text, boolean, integer)
  to service_role;

commit;
