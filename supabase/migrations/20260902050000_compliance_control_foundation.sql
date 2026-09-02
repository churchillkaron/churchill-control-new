begin;

create table if not exists public.compliance_frameworks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  framework_code text not null,
  framework_name text not null,
  framework_type text not null default 'REGULATORY',
  issuing_authority text,
  jurisdiction_code text,
  version text,
  effective_from date,
  effective_to date,
  status text not null default 'ACTIVE',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_frameworks_type_check
    check (framework_type in ('REGULATORY','STANDARD','POLICY','CONTRACTUAL','INTERNAL')),
  constraint compliance_frameworks_status_check
    check (status in ('DRAFT','ACTIVE','SUPERSEDED','ARCHIVED')),
  constraint compliance_frameworks_dates_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create unique index if not exists compliance_frameworks_org_code_unique
  on public.compliance_frameworks (organization_id, framework_code)
  where entity_id is null;
create unique index if not exists compliance_frameworks_entity_code_unique
  on public.compliance_frameworks (organization_id, entity_id, framework_code)
  where entity_id is not null;
create index if not exists compliance_frameworks_lookup_idx
  on public.compliance_frameworks (organization_id, entity_id, status, framework_type);

create table if not exists public.compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  framework_id uuid not null references public.compliance_frameworks(id) on delete cascade,
  requirement_code text not null,
  title text not null,
  description text,
  parent_requirement_id uuid references public.compliance_requirements(id) on delete set null,
  mandatory boolean not null default true,
  effective_from date,
  effective_to date,
  status text not null default 'ACTIVE',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_requirements_status_check
    check (status in ('DRAFT','ACTIVE','SUPERSEDED','ARCHIVED')),
  constraint compliance_requirements_dates_check
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint compliance_requirements_unique unique (framework_id, requirement_code)
);

create index if not exists compliance_requirements_lookup_idx
  on public.compliance_requirements (organization_id, entity_id, framework_id, status);

create table if not exists public.compliance_controls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  control_code text not null,
  control_name text not null,
  description text,
  control_type text not null default 'PREVENTIVE',
  frequency text not null default 'CONTINUOUS',
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  source_domain text,
  source_type text,
  source_id uuid,
  status text not null default 'ACTIVE',
  automation_level text not null default 'MANUAL',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_controls_type_check
    check (control_type in ('PREVENTIVE','DETECTIVE','CORRECTIVE','DIRECTIVE')),
  constraint compliance_controls_frequency_check
    check (frequency in ('CONTINUOUS','DAILY','WEEKLY','MONTHLY','QUARTERLY','ANNUAL','EVENT_DRIVEN','ON_DEMAND')),
  constraint compliance_controls_status_check
    check (status in ('DRAFT','ACTIVE','INEFFECTIVE','RETIRED')),
  constraint compliance_controls_automation_check
    check (automation_level in ('MANUAL','SEMI_AUTOMATED','AUTOMATED'))
);

create unique index if not exists compliance_controls_org_code_unique
  on public.compliance_controls (organization_id, control_code)
  where entity_id is null;
create unique index if not exists compliance_controls_entity_code_unique
  on public.compliance_controls (organization_id, entity_id, control_code)
  where entity_id is not null;
create index if not exists compliance_controls_owner_idx
  on public.compliance_controls (organization_id, entity_id, owner_staff_id, status);

create table if not exists public.compliance_control_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  control_id uuid not null references public.compliance_controls(id) on delete cascade,
  requirement_id uuid not null references public.compliance_requirements(id) on delete cascade,
  coverage_type text not null default 'FULL',
  notes text,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint compliance_control_requirements_coverage_check
    check (coverage_type in ('FULL','PARTIAL','SUPPORTING')),
  constraint compliance_control_requirements_unique unique (control_id, requirement_id)
);

create index if not exists compliance_control_requirements_requirement_idx
  on public.compliance_control_requirements (organization_id, requirement_id, control_id);

create table if not exists public.compliance_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  control_id uuid references public.compliance_controls(id) on delete cascade,
  requirement_id uuid references public.compliance_requirements(id) on delete cascade,
  enterprise_document_id uuid references public.enterprise_documents(id) on delete set null,
  evidence_type text not null default 'DOCUMENT',
  title text not null,
  description text,
  source_domain text,
  source_type text,
  source_id uuid,
  evidence_date date not null default current_date,
  valid_from date,
  valid_until date,
  verification_status text not null default 'UNVERIFIED',
  verified_by uuid references public.staff_accounts(id) on delete set null,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_evidence_type_check
    check (evidence_type in ('DOCUMENT','SYSTEM_RECORD','OBSERVATION','ATTESTATION','EXTERNAL_REPORT','PHOTO','OTHER')),
  constraint compliance_evidence_status_check
    check (verification_status in ('UNVERIFIED','VERIFIED','REJECTED','EXPIRED')),
  constraint compliance_evidence_dates_check
    check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint compliance_evidence_link_check
    check (control_id is not null or requirement_id is not null)
);

create index if not exists compliance_evidence_control_idx
  on public.compliance_evidence (organization_id, entity_id, control_id, verification_status, valid_until);
create index if not exists compliance_evidence_requirement_idx
  on public.compliance_evidence (organization_id, entity_id, requirement_id, verification_status);

create table if not exists public.compliance_control_tests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  control_id uuid not null references public.compliance_controls(id) on delete cascade,
  test_type text not null default 'DESIGN_AND_OPERATING_EFFECTIVENESS',
  period_start date,
  period_end date,
  due_date date,
  performed_by uuid references public.staff_accounts(id) on delete set null,
  performed_at timestamptz,
  result text not null default 'NOT_TESTED',
  sample_size integer,
  exceptions_found integer not null default 0,
  notes text,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_control_tests_type_check
    check (test_type in ('DESIGN_EFFECTIVENESS','OPERATING_EFFECTIVENESS','DESIGN_AND_OPERATING_EFFECTIVENESS','CONTINUOUS_MONITORING')),
  constraint compliance_control_tests_result_check
    check (result in ('NOT_TESTED','PASS','PASS_WITH_EXCEPTIONS','FAIL','NOT_APPLICABLE')),
  constraint compliance_control_tests_sample_check check (sample_size is null or sample_size >= 0),
  constraint compliance_control_tests_exception_check check (exceptions_found >= 0),
  constraint compliance_control_tests_period_check
    check (period_end is null or period_start is null or period_end >= period_start)
);

create index if not exists compliance_control_tests_queue_idx
  on public.compliance_control_tests (organization_id, entity_id, result, due_date);
create index if not exists compliance_control_tests_control_idx
  on public.compliance_control_tests (organization_id, control_id, performed_at desc);

create table if not exists public.compliance_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  obligation_type text not null,
  obligation_code text,
  title text not null,
  description text,
  framework_id uuid references public.compliance_frameworks(id) on delete set null,
  requirement_id uuid references public.compliance_requirements(id) on delete set null,
  authority_name text,
  jurisdiction_code text,
  reference_number text,
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  source_domain text,
  source_type text,
  source_id uuid,
  effective_from date,
  due_date date,
  expiry_date date,
  renewal_lead_days integer not null default 30,
  recurrence_rule text,
  status text not null default 'ACTIVE',
  criticality text not null default 'MEDIUM',
  enterprise_document_id uuid references public.enterprise_documents(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_obligations_type_check
    check (obligation_type in ('LICENSE','PERMIT','FILING','INSURANCE','CERTIFICATION','REGULATORY','CONTRACTUAL','POLICY_REVIEW','OTHER')),
  constraint compliance_obligations_status_check
    check (status in ('DRAFT','ACTIVE','PENDING','COMPLETED','EXPIRED','SUSPENDED','CANCELLED','NOT_APPLICABLE')),
  constraint compliance_obligations_criticality_check
    check (criticality in ('LOW','MEDIUM','HIGH','CRITICAL')),
  constraint compliance_obligations_renewal_check check (renewal_lead_days >= 0),
  constraint compliance_obligations_dates_check
    check (expiry_date is null or effective_from is null or expiry_date >= effective_from)
);

create index if not exists compliance_obligations_due_idx
  on public.compliance_obligations (organization_id, entity_id, status, due_date, expiry_date);
create index if not exists compliance_obligations_owner_idx
  on public.compliance_obligations (organization_id, entity_id, owner_staff_id, criticality, status);

create table if not exists public.compliance_risks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  risk_code text not null,
  title text not null,
  description text,
  category text,
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  source_domain text,
  source_type text,
  source_id uuid,
  inherent_likelihood integer not null default 1,
  inherent_impact integer not null default 1,
  residual_likelihood integer,
  residual_impact integer,
  appetite_level text not null default 'MEDIUM',
  treatment_strategy text not null default 'MITIGATE',
  status text not null default 'OPEN',
  next_review_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_risks_likelihood_check
    check (inherent_likelihood between 1 and 5 and (residual_likelihood is null or residual_likelihood between 1 and 5)),
  constraint compliance_risks_impact_check
    check (inherent_impact between 1 and 5 and (residual_impact is null or residual_impact between 1 and 5)),
  constraint compliance_risks_appetite_check
    check (appetite_level in ('LOW','MEDIUM','HIGH')),
  constraint compliance_risks_treatment_check
    check (treatment_strategy in ('ACCEPT','AVOID','TRANSFER','MITIGATE')),
  constraint compliance_risks_status_check
    check (status in ('OPEN','MONITORING','MITIGATED','ACCEPTED','CLOSED'))
);

create unique index if not exists compliance_risks_org_code_unique
  on public.compliance_risks (organization_id, risk_code)
  where entity_id is null;
create unique index if not exists compliance_risks_entity_code_unique
  on public.compliance_risks (organization_id, entity_id, risk_code)
  where entity_id is not null;
create index if not exists compliance_risks_review_idx
  on public.compliance_risks (organization_id, entity_id, status, next_review_date);

create table if not exists public.compliance_risk_controls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  risk_id uuid not null references public.compliance_risks(id) on delete cascade,
  control_id uuid not null references public.compliance_controls(id) on delete cascade,
  mitigation_strength text not null default 'PARTIAL',
  notes text,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint compliance_risk_controls_strength_check
    check (mitigation_strength in ('WEAK','PARTIAL','STRONG')),
  constraint compliance_risk_controls_unique unique (risk_id, control_id)
);

create table if not exists public.compliance_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  issue_code text not null,
  title text not null,
  description text,
  issue_type text not null default 'CONTROL_EXCEPTION',
  severity text not null default 'MEDIUM',
  status text not null default 'OPEN',
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  control_id uuid references public.compliance_controls(id) on delete set null,
  requirement_id uuid references public.compliance_requirements(id) on delete set null,
  risk_id uuid references public.compliance_risks(id) on delete set null,
  obligation_id uuid references public.compliance_obligations(id) on delete set null,
  control_test_id uuid references public.compliance_control_tests(id) on delete set null,
  source_domain text,
  source_type text,
  source_id uuid,
  identified_at timestamptz not null default now(),
  due_date date,
  resolved_at timestamptz,
  resolution_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_issues_type_check
    check (issue_type in ('CONTROL_EXCEPTION','NON_COMPLIANCE','AUDIT_FINDING','OBLIGATION_BREACH','RISK_EVENT','OTHER')),
  constraint compliance_issues_severity_check
    check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  constraint compliance_issues_status_check
    check (status in ('OPEN','IN_REMEDIATION','AWAITING_VALIDATION','RESOLVED','ACCEPTED','CLOSED'))
);

create unique index if not exists compliance_issues_org_code_unique
  on public.compliance_issues (organization_id, issue_code)
  where entity_id is null;
create unique index if not exists compliance_issues_entity_code_unique
  on public.compliance_issues (organization_id, entity_id, issue_code)
  where entity_id is not null;
create index if not exists compliance_issues_queue_idx
  on public.compliance_issues (organization_id, entity_id, status, severity, due_date);

create table if not exists public.compliance_remediation_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  issue_id uuid not null references public.compliance_issues(id) on delete cascade,
  action_number integer not null default 1,
  title text not null,
  description text,
  owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  due_date date,
  status text not null default 'OPEN',
  completed_at timestamptz,
  completion_evidence jsonb not null default '{}'::jsonb,
  verified_by uuid references public.staff_accounts(id) on delete set null,
  verified_at timestamptz,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_remediation_status_check
    check (status in ('OPEN','IN_PROGRESS','BLOCKED','COMPLETED','VERIFIED','CANCELLED')),
  constraint compliance_remediation_action_number_check check (action_number > 0),
  constraint compliance_remediation_unique unique (issue_id, action_number)
);

create index if not exists compliance_remediation_queue_idx
  on public.compliance_remediation_actions (organization_id, entity_id, status, due_date, owner_staff_id);

alter table public.compliance_frameworks enable row level security;
alter table public.compliance_requirements enable row level security;
alter table public.compliance_controls enable row level security;
alter table public.compliance_control_requirements enable row level security;
alter table public.compliance_evidence enable row level security;
alter table public.compliance_control_tests enable row level security;
alter table public.compliance_obligations enable row level security;
alter table public.compliance_risks enable row level security;
alter table public.compliance_risk_controls enable row level security;
alter table public.compliance_issues enable row level security;
alter table public.compliance_remediation_actions enable row level security;

comment on table public.compliance_frameworks is 'Configured compliance frameworks, standards, policies and contractual rule sets. No jurisdiction is hardcoded by the platform.';
comment on table public.compliance_controls is 'Reusable organization/entity controls linked to regulatory, policy and contractual requirements and to operating business records.';
comment on table public.compliance_obligations is 'Licenses, permits, filings, insurance, certifications, regulatory and contractual obligations with renewal/due lifecycle.';
comment on table public.compliance_evidence is 'Evidence linked to controls/requirements and optionally to governed enterprise documents or source business records.';
comment on table public.compliance_issues is 'Control exceptions, non-compliance, audit findings and obligation breaches routed into governed remediation.';

commit;
