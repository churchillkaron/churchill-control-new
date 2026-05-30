create table if not exists accounting_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workflow_name text not null,
  workflow_type text,
  status text default 'active',
  last_run_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists accounting_ai_chat_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_message text,
  ai_response text,
  created_at timestamptz default now()
);

create table if not exists executive_financial_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  summary_period text,
  revenue numeric(14,2),
  expenses numeric(14,2),
  profit numeric(14,2),
  cashflow numeric(14,2),
  ai_summary text,
  created_at timestamptz default now()
);
