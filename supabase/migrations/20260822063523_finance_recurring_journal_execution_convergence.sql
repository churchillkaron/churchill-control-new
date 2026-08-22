begin;

alter table public.finance_recurring_journal_templates
  add column if not exists exchange_rate numeric(20,10) not null default 1,
  add column if not exists last_run_at timestamptz,
  add column if not exists last_journal_entry_id uuid;

alter table public.finance_recurring_journal_templates
  drop constraint if exists finance_recurring_journal_templates_exchange_rate_chk;

alter table public.finance_recurring_journal_templates
  add constraint finance_recurring_journal_templates_exchange_rate_chk
  check (exchange_rate > 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finance_recurring_journal_templates_last_journal_fk'
      and conrelid = 'public.finance_recurring_journal_templates'::regclass
  ) then
    alter table public.finance_recurring_journal_templates
      add constraint finance_recurring_journal_templates_last_journal_fk
      foreign key (last_journal_entry_id)
      references public.journal_entries(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.finance_recurring_journal_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  template_id uuid not null references public.finance_recurring_journal_templates(id) on delete restrict,
  scheduled_date date not null,
  status text not null default 'CLAIMED',
  attempt_count integer not null default 1,
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  error_message text,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_recurring_journal_runs_status_chk
    check (status in ('CLAIMED','COMPLETED','FAILED')),
  constraint finance_recurring_journal_runs_attempt_chk
    check (attempt_count > 0)
);

create unique index if not exists finance_recurring_journal_runs_occurrence_uidx
  on public.finance_recurring_journal_runs(template_id, scheduled_date);

create index if not exists finance_recurring_journal_runs_retry_idx
  on public.finance_recurring_journal_runs(status, next_retry_at)
  where status = 'FAILED';

alter table public.finance_recurring_journal_runs enable row level security;

create or replace function public.claim_finance_recurring_journal_run(
  p_organization_id uuid,
  p_entity_id uuid,
  p_template_id uuid,
  p_scheduled_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  if p_organization_id is null or p_entity_id is null or p_template_id is null or p_scheduled_date is null then
    raise exception 'Recurring journal claim scope required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('recurring-journal:' || p_template_id::text || ':' || p_scheduled_date::text, 0)
  );

  select id into v_run_id
  from public.finance_recurring_journal_runs
  where template_id = p_template_id
    and scheduled_date = p_scheduled_date
  for update;

  if found then
    if exists (
      select 1 from public.finance_recurring_journal_runs
      where id = v_run_id
        and status = 'FAILED'
        and (next_retry_at is null or next_retry_at <= now())
    ) then
      update public.finance_recurring_journal_runs
      set status = 'CLAIMED',
          attempt_count = attempt_count + 1,
          error_message = null,
          claimed_at = now(),
          next_retry_at = null,
          updated_at = now()
      where id = v_run_id;
      return v_run_id;
    end if;

    return null;
  end if;

  insert into public.finance_recurring_journal_runs (
    organization_id,
    entity_id,
    template_id,
    scheduled_date,
    status
  ) values (
    p_organization_id,
    p_entity_id,
    p_template_id,
    p_scheduled_date,
    'CLAIMED'
  )
  returning id into v_run_id;

  return v_run_id;
end;
$$;

revoke all on function public.claim_finance_recurring_journal_run(uuid,uuid,uuid,date) from public;
revoke all on function public.claim_finance_recurring_journal_run(uuid,uuid,uuid,date) from anon;
revoke all on function public.claim_finance_recurring_journal_run(uuid,uuid,uuid,date) from authenticated;
grant execute on function public.claim_finance_recurring_journal_run(uuid,uuid,uuid,date) to service_role;

commit;
