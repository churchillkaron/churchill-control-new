create or replace function public.operations_lifecycle_initial_status(p_lifecycle text)
returns text
language sql
immutable
as $$
  select case coalesce(nullif(trim(p_lifecycle), ''), 'master')
    when 'control' then 'open'
    when 'evidence' then 'recorded'
    else 'draft'
  end;
$$;

create or replace function public.operations_lifecycle_target_status(
  p_lifecycle text,
  p_current_status text,
  p_command text
)
returns text
language plpgsql
immutable
as $$
declare
  v_lifecycle text := coalesce(nullif(trim(p_lifecycle), ''), 'master');
  v_status text := lower(coalesce(nullif(trim(p_current_status), ''), 'draft'));
  v_command text := lower(coalesce(nullif(trim(p_command), ''), ''));
begin
  v_status := case v_status
    when 'create' then 'draft'
    when 'record' then 'recorded'
    when 'start' then 'in_progress'
    when 'complete' then 'completed'
    when 'cancel' then 'cancelled'
    when 'reopen' then 'reopened'
    when 'activate' then 'active'
    when 'deactivate' then 'inactive'
    when 'archive' then 'archived'
    when 'submit' then 'submitted'
    when 'approve' then 'approved'
    when 'publish' then 'published'
    when 'revise' then 'revised'
    when 'assess' then 'assessed'
    when 'assign' then 'assigned'
    when 'resolve' then 'resolved'
    when 'close' then 'closed'
    when 'validate' then 'validated'
    when 'reject' then 'rejected'
    when 'supersede' then 'superseded'
    when 'void' then 'voided'
    else v_status
  end;

  if v_lifecycle = 'master' then
    if v_command = 'update' and v_status in ('draft', 'active', 'inactive') then return v_status; end if;
    if v_command = 'activate' and v_status in ('draft', 'inactive') then return 'active'; end if;
    if v_command = 'deactivate' and v_status = 'active' then return 'inactive'; end if;
    if v_command = 'archive' and v_status in ('draft', 'active', 'inactive') then return 'archived'; end if;
  elsif v_lifecycle = 'document' then
    if v_command = 'update' and v_status in ('draft', 'reopened') then return v_status; end if;
    if v_command = 'submit' and v_status in ('draft', 'reopened') then return 'submitted'; end if;
    if v_command = 'approve' and v_status = 'submitted' then return 'approved'; end if;
    if v_command = 'cancel' and v_status in ('draft', 'submitted', 'reopened') then return 'cancelled'; end if;
    if v_command = 'reopen' and v_status = 'cancelled' then return 'reopened'; end if;
  elsif v_lifecycle = 'execution' then
    if v_command = 'assign' and v_status in ('draft', 'reopened') then return 'assigned'; end if;
    if v_command = 'release' and v_status = 'assigned' then return 'released'; end if;
    if v_command = 'start' and v_status in ('assigned', 'released', 'paused') then return 'in_progress'; end if;
    if v_command = 'pause' and v_status = 'in_progress' then return 'paused'; end if;
    if v_command = 'complete' and v_status = 'in_progress' then return 'completed'; end if;
    if v_command = 'cancel' and v_status in ('draft', 'assigned', 'released', 'in_progress', 'paused', 'reopened') then return 'cancelled'; end if;
    if v_command = 'reopen' and v_status in ('cancelled', 'completed') then return 'reopened'; end if;
  elsif v_lifecycle = 'planning' then
    if v_command = 'update' and v_status in ('draft', 'revised') then return v_status; end if;
    if v_command = 'publish' and v_status in ('draft', 'revised') then return 'published'; end if;
    if v_command = 'revise' and v_status = 'published' then return 'revised'; end if;
    if v_command = 'cancel' and v_status in ('draft', 'revised', 'published') then return 'cancelled'; end if;
    if v_command = 'archive' and v_status in ('cancelled', 'published') then return 'archived'; end if;
  elsif v_lifecycle = 'control' then
    if v_command = 'assess' and v_status in ('open', 'reopened') then return 'assessed'; end if;
    if v_command = 'assign' and v_status in ('open', 'assessed', 'reopened') then return 'assigned'; end if;
    if v_command = 'resolve' and v_status in ('assessed', 'assigned') then return 'resolved'; end if;
    if v_command = 'close' and v_status = 'resolved' then return 'closed'; end if;
    if v_command = 'reopen' and v_status in ('resolved', 'closed') then return 'reopened'; end if;
  elsif v_lifecycle = 'evidence' then
    if v_command = 'validate' and v_status = 'recorded' then return 'validated'; end if;
    if v_command = 'reject' and v_status = 'recorded' then return 'rejected'; end if;
    if v_command = 'supersede' and v_status in ('recorded', 'validated', 'rejected') then return 'superseded'; end if;
    if v_command = 'void' and v_status in ('recorded', 'validated', 'rejected') then return 'voided'; end if;
  end if;

  raise exception 'Invalid Operations lifecycle transition: %.% from %', v_lifecycle, v_command, v_status;
end;
$$;

create or replace function public.guard_operations_record_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lifecycle text;
  v_command text;
begin
  v_lifecycle := coalesce(
    nullif(new.attributes ->> '_operations_lifecycle', ''),
    nullif(old.attributes ->> '_operations_lifecycle', ''),
    'master'
  );
  v_command := lower(coalesce(nullif(new.last_command, ''), ''));

  if tg_op = 'INSERT' then
    if v_command not in ('create', 'record') then
      raise exception 'Invalid Operations create command: %', v_command;
    end if;

    new.status := public.operations_lifecycle_initial_status(v_lifecycle);
    return new;
  end if;

  if v_command = '' then
    raise exception 'Operations lifecycle mutation requires last_command';
  end if;

  new.status := public.operations_lifecycle_target_status(
    v_lifecycle,
    old.status,
    v_command
  );

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' and v_command = 'reopen' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists operations_records_lifecycle_guard on public.operations_records;
create trigger operations_records_lifecycle_guard
before insert or update on public.operations_records
for each row
execute function public.guard_operations_record_lifecycle();

comment on function public.operations_lifecycle_target_status(text, text, text) is
  'Returns the governed target state for an industry-neutral Operations lifecycle command and rejects invalid transitions.';
comment on trigger operations_records_lifecycle_guard on public.operations_records is
  'Enforces canonical Operations lifecycle state transitions inside the atomic database transaction.';
