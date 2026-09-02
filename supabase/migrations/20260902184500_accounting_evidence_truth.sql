begin;

create table if not exists public.accounting_work_program_evidence_links (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid not null references public.legal_entities(id) on delete cascade,
  period_id uuid not null references public.financial_periods(id) on delete cascade,
  engagement_id uuid not null references public.accounting_engagements(id) on delete cascade,
  run_id uuid not null references public.accounting_engagement_runs(id) on delete cascade,
  work_item_id uuid not null references public.accounting_engagement_work_items(id) on delete cascade,
  document_id uuid not null references public.organization_documents(id) on delete cascade,
  evidence_category text not null,
  status text not null default 'ACTIVE',
  is_primary boolean not null default false,
  linked_by uuid null,
  linked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_work_program_evidence_category_required check (length(btrim(evidence_category)) > 0),
  constraint accounting_work_program_evidence_status_check check (status in ('ACTIVE','REJECTED','SUPERSEDED'))
);

create unique index if not exists accounting_work_program_evidence_links_active_unique
  on public.accounting_work_program_evidence_links (
    accounting_firm_id,
    work_item_id,
    document_id,
    evidence_category
  )
  where status = 'ACTIVE';

create index if not exists accounting_work_program_evidence_links_scope_idx
  on public.accounting_work_program_evidence_links (
    accounting_firm_id,
    organization_id,
    entity_id,
    period_id,
    run_id,
    work_item_id,
    status
  );

create index if not exists accounting_work_program_evidence_links_document_idx
  on public.accounting_work_program_evidence_links (document_id, status);

create or replace function public.validate_accounting_work_program_evidence_link()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  run_row public.accounting_engagement_runs%rowtype;
  item_row public.accounting_engagement_work_items%rowtype;
  document_organization_id uuid;
  entity_organization_id uuid;
  period_organization_id uuid;
  period_entity_id uuid;
begin
  new.evidence_category := lower(btrim(new.evidence_category));
  new.updated_at := now();

  select * into run_row
  from public.accounting_engagement_runs
  where id = new.run_id
    and accounting_firm_id = new.accounting_firm_id;

  if not found then
    raise exception 'EVIDENCE_RUN_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  if run_row.organization_id is null
     or run_row.entity_id is null
     or run_row.period_id is null then
    raise exception 'EVIDENCE_RUN_SCOPE_REQUIRED' using errcode = '23514';
  end if;

  if run_row.organization_id <> new.organization_id
     or run_row.entity_id <> new.entity_id
     or run_row.period_id <> new.period_id
     or run_row.engagement_id <> new.engagement_id then
    raise exception 'EVIDENCE_RUN_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  select * into item_row
  from public.accounting_engagement_work_items
  where id = new.work_item_id
    and run_id = new.run_id
    and accounting_firm_id = new.accounting_firm_id;

  if not found then
    raise exception 'EVIDENCE_WORK_ITEM_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  if item_row.entity_id is distinct from new.entity_id then
    raise exception 'EVIDENCE_WORK_ITEM_ENTITY_MISMATCH' using errcode = '23514';
  end if;

  select organization_id into document_organization_id
  from public.organization_documents
  where id = new.document_id;

  if not found or document_organization_id <> new.organization_id then
    raise exception 'EVIDENCE_DOCUMENT_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  select organization_id into entity_organization_id
  from public.legal_entities
  where id = new.entity_id;

  if not found or entity_organization_id <> new.organization_id then
    raise exception 'EVIDENCE_ENTITY_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  select organization_id, entity_id
    into period_organization_id, period_entity_id
  from public.financial_periods
  where id = new.period_id;

  if not found
     or period_organization_id <> new.organization_id
     or period_entity_id <> new.entity_id then
    raise exception 'EVIDENCE_PERIOD_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_accounting_work_program_evidence_link() from public, anon, authenticated;
grant execute on function public.validate_accounting_work_program_evidence_link() to service_role;

drop trigger if exists accounting_work_program_evidence_link_scope_guard
  on public.accounting_work_program_evidence_links;
create trigger accounting_work_program_evidence_link_scope_guard
before insert or update
on public.accounting_work_program_evidence_links
for each row
execute function public.validate_accounting_work_program_evidence_link();

alter table public.accounting_work_program_evidence_links enable row level security;
revoke all on table public.accounting_work_program_evidence_links from anon, authenticated;
grant select, insert, update, delete on table public.accounting_work_program_evidence_links to service_role;

update public.accounting_work_program_template_steps s
set metadata = jsonb_set(
  coalesce(s.metadata, '{}'::jsonb),
  '{system_verification}',
  '{"mode":"DOCUMENT_CATEGORIES","categories":[{"key":"source_documents","label":"Source documents","min_count":1}],"accepted_link_statuses":["ACTIVE"]}'::jsonb,
  true
)
from public.accounting_work_program_templates t
where s.template_id = t.id
  and t.template_key = 'monthly_accounting_baseline'
  and s.step_key = 'source_completeness';

update public.accounting_work_program_template_steps s
set metadata = jsonb_set(
  coalesce(s.metadata, '{}'::jsonb),
  '{system_verification}',
  '{"mode":"FINANCIAL_REPORT_SET","reports":["trial_balance","profit_loss","balance_sheet"],"require_balanced_trial_balance":true}'::jsonb,
  true
)
from public.accounting_work_program_templates t
where s.template_id = t.id
  and t.template_key in ('monthly_accounting_baseline','year_end_close_baseline')
  and s.capability_id = 'statements';

update public.accounting_work_program_template_steps s
set metadata = jsonb_set(
  coalesce(s.metadata, '{}'::jsonb),
  '{system_verification}',
  '{"mode":"DEPENDENCY_AUDIT_CHAIN"}'::jsonb,
  true
)
from public.accounting_work_program_templates t
where s.template_id = t.id
  and t.template_key in ('monthly_accounting_baseline','year_end_close_baseline')
  and s.capability_id = 'audit_trail';

create or replace function public.enforce_accounting_work_item_system_gate()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status in ('READY_FOR_REVIEW','COMPLETE')
     and coalesce(new.capability_id, '') in (
       'bank_reconciliation',
       'journals',
       'statutory_filings',
       'close',
       'documents',
       'statements',
       'audit_trail'
     )
     and coalesce((new.metadata->'system_gate'->>'satisfied')::boolean, false) is not true then
    raise exception 'SYSTEM_GATE_REQUIRED:%', new.capability_id using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_accounting_work_item_system_gate() from public, anon, authenticated;
grant execute on function public.enforce_accounting_work_item_system_gate() to service_role;

commit;
