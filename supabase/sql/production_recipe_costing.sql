create table if not exists recipe_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  recipe_id uuid not null,
  total_ingredient_cost numeric(14,2) default 0,
  labor_cost numeric(14,2) default 0,
  overhead_cost numeric(14,2) default 0,
  total_cost numeric(14,2) default 0,
  selling_price numeric(14,2) default 0,
  gross_margin numeric(14,2) default 0,
  gross_margin_percent numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists menu_engineering_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  recipe_id uuid not null,
  popularity_score numeric(14,2) default 0,
  profitability_score numeric(14,2) default 0,
  engineering_category text,
  created_at timestamptz default now()
);

create table if not exists shift_profitability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  shift_name text not null,
  revenue numeric(14,2) default 0,
  food_cost numeric(14,2) default 0,
  labor_cost numeric(14,2) default 0,
  gross_profit numeric(14,2) default 0,
  net_margin numeric(14,2) default 0,
  created_at timestamptz default now()
);
