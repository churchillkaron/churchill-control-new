create table if not exists internal_controls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  control_name text,
  control_type text,
  status text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists internal_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  audit_area text,
  findings text,
  risk_level text,
  created_at timestamptz default now()
);

create table if not exists policy_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  policy_name text,
  policy_type text,
  rule_definition jsonb,
  created_at timestamptz default now()
);

create table if not exists segregation_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  user_email text,
  violation_type text,
  severity text,
  notes text,
  created_at timestamptz default now()
);
