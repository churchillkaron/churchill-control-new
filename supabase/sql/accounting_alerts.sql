create table if not exists accounting_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  alert_type text not null,
  severity text default 'info',
  title text not null,
  message text,
  status text default 'open',
  created_at timestamptz default now()
);
