begin;

alter table public.finance_recurring_journal_templates
  add column if not exists timezone text not null default 'Asia/Bangkok';

create or replace function public.finalize_finance_recurring_journal_run(
  p_run_id uuid,
  p_template_id uuid,
  p_scheduled_date date,
  p_journal_entry_id uuid,
  p_next_run_date date,
  p_has_ended boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.finance_recurring_journal_runs%rowtype;
  v_template public.finance_recurring_journal_templates%rowtype;
  v_now timestamptz := now();
begin
  if p_run_id is null or p_template_id is null or p_scheduled_date is null or p_journal_entry_id is null or p_next_run_date is null then
    raise exception 'Recurring journal finalization fields required';
  end if;

  select * into v_run
  from public.finance_recurring_journal_runs
  where id = p_run_id
    and template_id = p_template_id
    and scheduled_date = p_scheduled_date
  for update;

  if not found then
    raise exception 'Recurring journal run not found';
  end if;

  if v_run.status = 'COMPLETED' then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'run_id', v_run.id,
      'journal_entry_id', v_run.journal_entry_id
    );
  end if;

  if v_run.status <> 'CLAIMED' then
    raise exception 'Recurring journal run is not claimed';
  end if;

  select * into v_template
  from public.finance_recurring_journal_templates
  where id = p_template_id
    and organization_id = v_run.organization_id
    and entity_id = v_run.entity_id
  for update;

  if not found then
    raise exception 'Recurring journal template not found';
  end if;

  if v_template.next_run_date <> p_scheduled_date then
    raise exception 'Recurring journal template occurrence changed before finalization';
  end if;

  update public.finance_recurring_journal_runs
  set status = 'COMPLETED',
      journal_entry_id = p_journal_entry_id,
      error_message = null,
      completed_at = v_now,
      next_retry_at = null,
      updated_at = v_now
  where id = p_run_id;

  update public.finance_recurring_journal_templates
  set last_run_at = v_now,
      last_journal_entry_id = p_journal_entry_id,
      next_run_date = p_next_run_date,
      status = case when p_has_ended then 'INACTIVE' else 'ACTIVE' end,
      updated_at = v_now
  where id = p_template_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'run_id', p_run_id,
    'journal_entry_id', p_journal_entry_id,
    'next_run_date', p_next_run_date,
    'completed', p_has_ended
  );
end;
$$;

revoke all on function public.finalize_finance_recurring_journal_run(uuid,uuid,date,uuid,date,boolean) from public;
revoke all on function public.finalize_finance_recurring_journal_run(uuid,uuid,date,uuid,date,boolean) from anon;
revoke all on function public.finalize_finance_recurring_journal_run(uuid,uuid,date,uuid,date,boolean) from authenticated;
grant execute on function public.finalize_finance_recurring_journal_run(uuid,uuid,date,uuid,date,boolean) to service_role;

commit;
