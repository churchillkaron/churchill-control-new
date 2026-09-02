begin;

create table if not exists public.accounting_work_program_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  template_key text not null,
  name text not null,
  description text,
  service_key text,
  cadence text not null default 'MONTHLY' check (cadence in ('WEEKLY','MONTHLY','QUARTERLY','ANNUAL','AD_HOC')),
  version integer not null default 1 check (version > 0),
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  is_system boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists accounting_work_program_templates_scope_key_uidx
  on public.accounting_work_program_templates (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    template_key,
    version
  );

create index if not exists accounting_work_program_templates_lookup_idx
  on public.accounting_work_program_templates (organization_id, status, cadence, template_key);

create table if not exists public.accounting_work_program_template_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  template_id uuid not null references public.accounting_work_program_templates(id) on delete cascade,
  step_key text not null,
  sequence_no integer not null check (sequence_no > 0),
  title text not null,
  description text,
  work_type text not null default 'INTERNAL' check (work_type in ('INTERNAL','CLIENT_REQUEST','FINANCE_REVIEW','DELIVERABLE','SYSTEM')),
  required_role text not null default 'PREPARER' check (required_role in ('PREPARER','REVIEWER','PARTNER','CLIENT','SYSTEM')),
  relative_due_days integer not null default 0,
  due_anchor text not null default 'PERIOD_END' check (due_anchor in ('RUN_START','PERIOD_END')),
  dependency_step_keys text[] not null default '{}',
  capability_id text,
  instructions text,
  evidence_required boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, step_key),
  unique (template_id, sequence_no)
);

create index if not exists accounting_work_program_template_steps_order_idx
  on public.accounting_work_program_template_steps (template_id, sequence_no);

create table if not exists public.accounting_engagement_runs (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  organization_id uuid not null,
  engagement_id uuid not null references public.accounting_engagements(id) on delete cascade,
  template_id uuid not null references public.accounting_work_program_templates(id),
  period_id uuid,
  run_key text not null,
  cadence text not null check (cadence in ('WEEKLY','MONTHLY','QUARTERLY','ANNUAL','AD_HOC')),
  status text not null default 'PLANNED' check (status in ('PLANNED','IN_PROGRESS','WAITING_ON_CLIENT','READY_FOR_REVIEW','REVIEWED','CLEARED','COMPLETE','BLOCKED','CANCELLED')),
  start_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  rolled_from_run_id uuid references public.accounting_engagement_runs(id),
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accounting_firm_id, engagement_id, run_key)
);

create index if not exists accounting_engagement_runs_firm_status_idx
  on public.accounting_engagement_runs (accounting_firm_id, status, due_at, updated_at desc);
create index if not exists accounting_engagement_runs_client_idx
  on public.accounting_engagement_runs (organization_id, engagement_id, period_id, created_at desc);

create table if not exists public.accounting_engagement_work_items (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  organization_id uuid not null,
  run_id uuid not null references public.accounting_engagement_runs(id) on delete cascade,
  template_step_id uuid references public.accounting_work_program_template_steps(id),
  step_key text not null,
  sequence_no integer not null,
  title text not null,
  description text,
  work_type text not null check (work_type in ('INTERNAL','CLIENT_REQUEST','FINANCE_REVIEW','DELIVERABLE','SYSTEM')),
  required_role text not null check (required_role in ('PREPARER','REVIEWER','PARTNER','CLIENT','SYSTEM')),
  assigned_to uuid,
  status text not null default 'NOT_STARTED' check (status in ('NOT_STARTED','READY','IN_PROGRESS','WAITING_ON_CLIENT','BLOCKED','READY_FOR_REVIEW','CHANGES_REQUESTED','COMPLETE','SKIPPED')),
  start_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  blocked_reason text,
  dependency_step_keys text[] not null default '{}',
  capability_id text,
  finance_review_item_id uuid references public.finance_review_items(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  conclusion text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, step_key),
  unique (run_id, sequence_no)
);

create index if not exists accounting_engagement_work_items_queue_idx
  on public.accounting_engagement_work_items (accounting_firm_id, status, due_at, sequence_no);
create index if not exists accounting_engagement_work_items_run_idx
  on public.accounting_engagement_work_items (run_id, sequence_no);

create table if not exists public.accounting_client_requests (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  organization_id uuid not null,
  run_id uuid not null references public.accounting_engagement_runs(id) on delete cascade,
  work_item_id uuid not null references public.accounting_engagement_work_items(id) on delete cascade,
  title text not null,
  instructions text,
  status text not null default 'DRAFT' check (status in ('DRAFT','SENT','VIEWED','IN_PROGRESS','SUBMITTED','ACCEPTED','CHANGES_REQUESTED','CANCELLED')),
  due_at timestamptz,
  sent_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  reminder_policy jsonb not null default '{}'::jsonb,
  client_response jsonb not null default '{}'::jsonb,
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_item_id)
);

create index if not exists accounting_client_requests_firm_status_idx
  on public.accounting_client_requests (accounting_firm_id, status, due_at, updated_at desc);
create index if not exists accounting_client_requests_client_idx
  on public.accounting_client_requests (organization_id, status, due_at);

alter table public.accounting_work_program_templates enable row level security;
alter table public.accounting_work_program_template_steps enable row level security;
alter table public.accounting_engagement_runs enable row level security;
alter table public.accounting_engagement_work_items enable row level security;
alter table public.accounting_client_requests enable row level security;

comment on table public.accounting_work_program_templates is
  'Versioned accounting-firm work program templates. organization_id null denotes an Avantiqo system template; firm templates remain organization scoped.';
comment on table public.accounting_work_program_template_steps is
  'Ordered reusable engagement procedures with relative deadlines, dependencies, role handoffs, capability links and evidence requirements.';
comment on table public.accounting_engagement_runs is
  'Immutable-period instances of an accounting engagement work program, supporting recurring month/quarter/year workflows and roll-forward.';
comment on table public.accounting_engagement_work_items is
  'Operational engagement work items generated from a work program. Completion evidence is separate from accounting posting state.';
comment on table public.accounting_client_requests is
  'Client-facing requests for evidence, information or approval tied to accounting engagement work items.';

with inserted as (
  insert into public.accounting_work_program_templates (
    organization_id, template_key, name, description, service_key, cadence, version, status, is_system, metadata
  ) values (
    null,
    'monthly_accounting_baseline',
    'Monthly Accounting Baseline',
    'Reusable monthly accounting work program from evidence collection through partner clearance and client delivery.',
    'monthly_accounting',
    'MONTHLY',
    1,
    'ACTIVE',
    true,
    jsonb_build_object('source', 'avantiqo_system')
  )
  on conflict do nothing
  returning id
), template as (
  select id from inserted
  union all
  select id from public.accounting_work_program_templates
  where organization_id is null and template_key = 'monthly_accounting_baseline' and version = 1
  limit 1
)
insert into public.accounting_work_program_template_steps (
  organization_id, template_id, step_key, sequence_no, title, description, work_type, required_role,
  relative_due_days, due_anchor, dependency_step_keys, capability_id, evidence_required, metadata
)
select null, template.id, steps.step_key, steps.sequence_no, steps.title, steps.description, steps.work_type, steps.required_role,
       steps.relative_due_days, 'PERIOD_END', steps.dependencies, steps.capability_id, steps.evidence_required,
       jsonb_build_object('source', 'avantiqo_system')
from template
cross join (values
  ('client_evidence', 1, 'Collect client evidence', 'Request bank, sales, purchase, payroll and other period evidence required by the engagement.', 'CLIENT_REQUEST', 'CLIENT', 2, array[]::text[], null::text, true),
  ('source_completeness', 2, 'Validate source completeness', 'Confirm imported/source documents are complete before substantive accounting work starts.', 'INTERNAL', 'PREPARER', 3, array['client_evidence']::text[], 'documents', true),
  ('reconcile_subledgers', 3, 'Reconcile bank, receivables and payables', 'Clear reconciliation differences and unresolved subledger exceptions.', 'INTERNAL', 'PREPARER', 5, array['source_completeness']::text[], 'bank_reconciliation', true),
  ('period_adjustments', 4, 'Prepare period adjustments', 'Post governed accruals, deferrals, depreciation, FX and other approved period adjustments.', 'INTERNAL', 'PREPARER', 6, array['reconcile_subledgers']::text[], 'journals', true),
  ('tax_and_statutory', 5, 'Complete tax and statutory checks', 'Complete applicable tax/statutory work defined by the client engagement without jurisdiction-specific hardcoding.', 'INTERNAL', 'PREPARER', 7, array['period_adjustments']::text[], 'statutory_filings', true),
  ('management_accounts', 6, 'Prepare management accounts', 'Prepare trial balance, financial statements and management reporting package for review.', 'DELIVERABLE', 'PREPARER', 8, array['tax_and_statutory']::text[], 'statements', true),
  ('reviewer_review', 7, 'Reviewer review', 'Review workpapers, accounting conclusions, exceptions and open review points.', 'FINANCE_REVIEW', 'REVIEWER', 9, array['management_accounts']::text[], 'audit_trail', true),
  ('clear_review_points', 8, 'Clear review points', 'Resolve reviewer queries and document conclusions before final clearance.', 'FINANCE_REVIEW', 'PREPARER', 10, array['reviewer_review']::text[], 'audit_trail', true),
  ('partner_clearance', 9, 'Partner clearance', 'Complete final partner sign-off after preparer/reviewer evidence and all review points are cleared.', 'FINANCE_REVIEW', 'PARTNER', 11, array['clear_review_points']::text[], 'audit_trail', true),
  ('client_delivery', 10, 'Deliver final client pack', 'Release approved deliverables and preserve completion evidence for the engagement period.', 'DELIVERABLE', 'PREPARER', 12, array['partner_clearance']::text[], 'statements', true)
) as steps(step_key, sequence_no, title, description, work_type, required_role, relative_due_days, dependencies, capability_id, evidence_required)
on conflict (template_id, step_key) do nothing;

with inserted as (
  insert into public.accounting_work_program_templates (
    organization_id, template_key, name, description, service_key, cadence, version, status, is_system, metadata
  ) values (
    null,
    'year_end_close_baseline',
    'Year-End Close Baseline',
    'Reusable annual accounting-firm close and finalization program with acceptance, PBC evidence, review and roll-forward controls.',
    'year_end_close',
    'ANNUAL',
    1,
    'ACTIVE',
    true,
    jsonb_build_object('source', 'avantiqo_system')
  )
  on conflict do nothing
  returning id
), template as (
  select id from inserted
  union all
  select id from public.accounting_work_program_templates
  where organization_id is null and template_key = 'year_end_close_baseline' and version = 1
  limit 1
)
insert into public.accounting_work_program_template_steps (
  organization_id, template_id, step_key, sequence_no, title, description, work_type, required_role,
  relative_due_days, due_anchor, dependency_step_keys, capability_id, evidence_required, metadata
)
select null, template.id, steps.step_key, steps.sequence_no, steps.title, steps.description, steps.work_type, steps.required_role,
       steps.relative_due_days, 'PERIOD_END', steps.dependencies, steps.capability_id, steps.evidence_required,
       jsonb_build_object('source', 'avantiqo_system')
from template
cross join (values
  ('acceptance_continuance', 1, 'Acceptance and continuance', 'Document engagement acceptance/continuance and responsibility before year-end work proceeds.', 'INTERNAL', 'PARTNER', -15, array[]::text[], 'audit_trail', true),
  ('pbc_evidence', 2, 'Collect year-end evidence', 'Issue a structured PBC request for year-end documents and client confirmations.', 'CLIENT_REQUEST', 'CLIENT', 5, array['acceptance_continuance']::text[], null::text, true),
  ('year_end_reconciliations', 3, 'Complete year-end reconciliations', 'Complete bank, receivable, payable and key balance reconciliations.', 'INTERNAL', 'PREPARER', 10, array['pbc_evidence']::text[], 'bank_reconciliation', true),
  ('year_end_adjustments', 4, 'Prepare year-end adjustments', 'Complete governed closing journals, accruals, depreciation, FX and other adjustments.', 'INTERNAL', 'PREPARER', 14, array['year_end_reconciliations']::text[], 'journals', true),
  ('tax_statutory_final', 5, 'Finalize tax and statutory work', 'Complete applicable year-end tax and statutory obligations defined by the engagement.', 'INTERNAL', 'PREPARER', 18, array['year_end_adjustments']::text[], 'statutory_filings', true),
  ('financial_statements', 6, 'Prepare final financial statements', 'Prepare final statements and supporting workpapers for review.', 'DELIVERABLE', 'PREPARER', 21, array['tax_statutory_final']::text[], 'statements', true),
  ('reviewer_final', 7, 'Final reviewer review', 'Perform reviewer sign-off across workpapers, statements and unresolved exceptions.', 'FINANCE_REVIEW', 'REVIEWER', 24, array['financial_statements']::text[], 'audit_trail', true),
  ('partner_final', 8, 'Partner final clearance', 'Complete final partner sign-off after all review points are resolved.', 'FINANCE_REVIEW', 'PARTNER', 27, array['reviewer_final']::text[], 'audit_trail', true),
  ('finalize_lock', 9, 'Finalize and lock engagement', 'Finalize deliverables, preserve audit evidence and prevent accidental post-clearance edits.', 'SYSTEM', 'SYSTEM', 28, array['partner_final']::text[], 'close', true),
  ('roll_forward', 10, 'Roll forward next year', 'Create the next engagement cycle from the approved template without carrying forward completion evidence as current.', 'SYSTEM', 'SYSTEM', 30, array['finalize_lock']::text[], null::text, false)
) as steps(step_key, sequence_no, title, description, work_type, required_role, relative_due_days, dependencies, capability_id, evidence_required)
on conflict (template_id, step_key) do nothing;

commit;
