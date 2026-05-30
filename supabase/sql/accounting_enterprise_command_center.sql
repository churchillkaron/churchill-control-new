create table if not exists enterprise_command_center_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  operational_health numeric(14,2) default 0,
  accounting_health numeric(14,2) default 0,
  treasury_health numeric(14,2) default 0,
  compliance_health numeric(14,2) default 0,
  profitability_health numeric(14,2) default 0,
  ai_confidence numeric(14,2) default 0,
  overall_health numeric(14,2) default 0,
  system_status text default 'stable',
  created_at timestamptz default now()
);
