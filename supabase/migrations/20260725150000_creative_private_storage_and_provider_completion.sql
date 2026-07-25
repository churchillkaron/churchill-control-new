-- AVANTIQO CREATIVE PRIVATE STORAGE AND PROVIDER COMPLETION
-- Makes provider callbacks exactly-once at settlement time and guarantees the
-- canonical Creative asset bucket remains private.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'creative-assets',
  'creative-assets',
  false,
  1073741824,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

create or replace function public.claim_creative_provider_completion(
  p_task_id uuid,
  p_organization_id uuid,
  p_provider_id text,
  p_provider_job_id text,
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
  v_provider_id text := lower(nullif(btrim(coalesce(p_provider_id, '')), ''));
  v_provider_job_id text := nullif(btrim(coalesce(p_provider_job_id, '')), '');
begin
  if p_task_id is null or p_organization_id is null then
    raise exception 'task_id and organization_id required';
  end if;
  if v_provider_id is null then
    raise exception 'provider_id required';
  end if;
  if v_provider_job_id is null then
    raise exception 'provider_job_id required';
  end if;
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'worker_id required';
  end if;

  return query
  update public.creative_production_tasks task
  set lease_token = gen_random_uuid(),
      leased_by = btrim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      last_heartbeat_at = now(),
      updated_at = now()
  where task.id = p_task_id
    and task.organization_id = p_organization_id
    and task.status = 'RUNNING'
    and lower(coalesce(task.provider_id, '')) = v_provider_id
    and coalesce(task.output->>'provider_job_id', '') = v_provider_job_id
    and (
      task.lease_token is null
      or task.lease_expires_at is null
      or task.lease_expires_at <= now()
    )
  returning task.*;
end;
$$;

create or replace function public.record_creative_provider_progress(
  p_task_id uuid,
  p_organization_id uuid,
  p_provider_id text,
  p_provider_job_id text,
  p_provider_status text,
  p_output jsonb default '{}'::jsonb
)
returns setof public.creative_production_tasks
language sql
security definer
set search_path = public
as $$
  update public.creative_production_tasks task
  set output = coalesce(task.output, '{}'::jsonb)
        || coalesce(p_output, '{}'::jsonb)
        || jsonb_build_object(
          'provider_status', nullif(btrim(coalesce(p_provider_status, '')), '')
        ),
      updated_at = now()
  where task.id = p_task_id
    and task.organization_id = p_organization_id
    and task.status = 'RUNNING'
    and lower(coalesce(task.provider_id, '')) = lower(btrim(coalesce(p_provider_id, '')))
    and coalesce(task.output->>'provider_job_id', '') = btrim(coalesce(p_provider_job_id, ''))
    and task.lease_token is null
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
        (p_lease_token is null and task.lease_token is null)
        or task.lease_token = p_lease_token
      )
    returning task.*
  )
  select * from changed
  union all
  select task.*
  from public.creative_production_tasks task
  where task.id = p_task_id
    and task.organization_id = p_organization_id
    and task.status in ('COMPLETED', 'FAILED', 'SKIPPED')
    and not exists (select 1 from changed)
  limit 1;
end;
$$;

revoke all on function public.claim_creative_provider_completion(
  uuid, uuid, text, text, text, integer
) from public, anon, authenticated;
revoke all on function public.record_creative_provider_progress(
  uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.finalize_creative_production_task(
  uuid, uuid, text, jsonb, text, uuid
) from public, anon, authenticated;

grant execute on function public.claim_creative_provider_completion(
  uuid, uuid, text, text, text, integer
) to service_role;
grant execute on function public.record_creative_provider_progress(
  uuid, uuid, text, text, text, jsonb
) to service_role;
grant execute on function public.finalize_creative_production_task(
  uuid, uuid, text, jsonb, text, uuid
) to service_role;

commit;
