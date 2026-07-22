begin;

alter table if exists public.creative_production_tasks
  add column if not exists worker_id text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists failure_class text,
  add column if not exists dead_lettered_at timestamptz;

create index if not exists creative_production_tasks_runnable_idx
  on public.creative_production_tasks (
    status,
    next_attempt_at,
    lease_expires_at,
    priority,
    created_at
  );

create index if not exists creative_production_tasks_project_execution_idx
  on public.creative_production_tasks (
    organization_id,
    creative_project_id,
    status
  );

create or replace function public.claim_creative_production_task(
  p_task_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.creative_production_tasks
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker_id required';
  end if;

  return query
  update public.creative_production_tasks as task
  set
    status = 'RUNNING',
    worker_id = p_worker_id,
    lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
    last_heartbeat_at = now(),
    next_attempt_at = null,
    updated_at = now()
  where task.id = p_task_id
    and task.status = 'READY'
    and task.dead_lettered_at is null
    and (task.next_attempt_at is null or task.next_attempt_at <= now())
    and (task.lease_expires_at is null or task.lease_expires_at <= now())
  returning task.*;
end;
$$;

create or replace function public.lease_running_creative_production_task(
  p_task_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns setof public.creative_production_tasks
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker_id required';
  end if;

  return query
  update public.creative_production_tasks as task
  set
    worker_id = p_worker_id,
    lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
    last_heartbeat_at = now(),
    updated_at = now()
  where task.id = p_task_id
    and task.status = 'RUNNING'
    and task.dead_lettered_at is null
    and (
      task.worker_id = p_worker_id
      or task.lease_expires_at is null
      or task.lease_expires_at <= now()
    )
  returning task.*;
end;
$$;

create or replace function public.heartbeat_creative_production_task(
  p_task_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.creative_production_tasks as task
  set
    lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
    last_heartbeat_at = now(),
    updated_at = now()
  where task.id = p_task_id
    and task.worker_id = p_worker_id
    and task.status = 'RUNNING';

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_creative_production_task_lease(
  p_task_id uuid,
  p_worker_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.creative_production_tasks as task
  set
    worker_id = null,
    lease_expires_at = null,
    last_heartbeat_at = now(),
    updated_at = now()
  where task.id = p_task_id
    and (task.worker_id = p_worker_id or task.worker_id is null);

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_creative_production_task(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.lease_running_creative_production_task(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.heartbeat_creative_production_task(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.release_creative_production_task_lease(uuid, text)
  from public, anon, authenticated;

grant execute on function public.claim_creative_production_task(uuid, text, integer)
  to service_role;
grant execute on function public.lease_running_creative_production_task(uuid, text, integer)
  to service_role;
grant execute on function public.heartbeat_creative_production_task(uuid, text, integer)
  to service_role;
grant execute on function public.release_creative_production_task_lease(uuid, text)
  to service_role;

commit;
