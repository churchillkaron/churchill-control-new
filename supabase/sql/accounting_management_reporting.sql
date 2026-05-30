create table if not exists cost_centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  center_code text not null,
  center_name text not null,
  department text,
  created_at timestamptz default now()
);

create table if not exists department_performance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  department text not null,
  revenue numeric(14,2) default 0,
  expenses numeric(14,2) default 0,
  profit numeric(14,2) default 0,
  margin numeric(8,2) default 0,
  created_at timestamptz default now()
);
