create or replace function public.sync_creative_direction_approval_terminal_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approval_id text;
  current_approval jsonb;
  terminal_patch jsonb;
begin
  if new.job_type <> 'PROJECT_DIRECTION'
     or new.status not in ('COMPLETED', 'FAILED') then
    return new;
  end if;

  approval_id := nullif(btrim(new.payload->>'direction_approval_id'), '');
  if approval_id is null then
    return new;
  end if;

  select p.metadata->'paid_direction_approval'
    into current_approval
  from public.creative_projects p
  where p.id = new.creative_project_id
    and p.organization_id = new.organization_id
  for update;

  if current_approval is null
     or current_approval->>'id' is distinct from approval_id then
    return new;
  end if;

  if new.status = 'COMPLETED' then
    terminal_patch := jsonb_build_object(
      'status', 'COMPLETED',
      'approved', false,
      'completed_at', coalesce(new.completed_at, now()),
      'completed_job_id', new.id,
      'failed_at', null,
      'retry_required', false,
      'execution_error', null,
      'automatic_retry_authorized', false,
      'production_authorized', false,
      'media_generation_authorized', false,
      'publication_authorized', false
    );
  else
    terminal_patch := jsonb_build_object(
      'status', 'FAILED',
      'approved', false,
      'failed_at', now(),
      'failed_job_id', new.id,
      'retry_required', true,
      'execution_error', coalesce(new.error, '{}'::jsonb),
      'automatic_retry_authorized', false,
      'production_authorized', false,
      'media_generation_authorized', false,
      'publication_authorized', false
    );
  end if;

  update public.creative_projects p
  set metadata = jsonb_set(
        p.metadata,
        '{paid_direction_approval}',
        current_approval || terminal_patch,
        true
      ),
      updated_at = now()
  where p.id = new.creative_project_id
    and p.organization_id = new.organization_id
    and p.metadata->'paid_direction_approval'->>'id' = approval_id;

  return new;
end;
$$;

drop trigger if exists trg_creative_direction_approval_terminal_guard
  on public.creative_execution_jobs;

create trigger trg_creative_direction_approval_terminal_guard
after update of status on public.creative_execution_jobs
for each row
when (
  old.status is distinct from new.status
  and new.job_type = 'PROJECT_DIRECTION'
  and new.status in ('COMPLETED', 'FAILED')
)
execute function public.sync_creative_direction_approval_terminal_state();

comment on function public.sync_creative_direction_approval_terminal_state() is
  'Seals only the paid direction approval referenced by a terminal PROJECT_DIRECTION job; prevents stale jobs from closing newer approvals and keeps production authorization false.';
