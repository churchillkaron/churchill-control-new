alter table public.kitchen_queue enable row level security;
alter table public.kitchen_tickets enable row level security;
alter table public.kitchen_daily_reports enable row level security;
alter table public.kitchen_monthly_reports enable row level security;
alter table public.kitchen_payroll_adjustments enable row level security;
alter table public.kitchen_ai_recommendations enable row level security;
alter table public.kitchen_predictive_alerts enable row level security;
alter table public.kitchen_executive_reports enable row level security;
alter table public.kitchen_ownership_matrix enable row level security;
alter table public.kitchen_disciplinary_reports enable row level security;
alter table public.kitchen_termination_risk_reports enable row level security;
alter table public.kitchen_promotion_eligibility enable row level security;
alter table public.kitchen_succession_planning enable row level security;
alter table public.kitchen_culture_scores enable row level security;
alter table public.kitchen_psychological_stability enable row level security;
alter table public.kitchen_burnout_risk enable row level security;

create policy "tenant access kitchen queue"
on public.kitchen_queue
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen tickets"
on public.kitchen_tickets
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen daily reports"
on public.kitchen_daily_reports
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen monthly reports"
on public.kitchen_monthly_reports
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen payroll adjustments"
on public.kitchen_payroll_adjustments
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen ai recommendations"
on public.kitchen_ai_recommendations
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen predictive alerts"
on public.kitchen_predictive_alerts
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen executive reports"
on public.kitchen_executive_reports
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen ownership matrix"
on public.kitchen_ownership_matrix
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen disciplinary reports"
on public.kitchen_disciplinary_reports
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen termination risk"
on public.kitchen_termination_risk_reports
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen promotion eligibility"
on public.kitchen_promotion_eligibility
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen succession planning"
on public.kitchen_succession_planning
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen culture scores"
on public.kitchen_culture_scores
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen psychological stability"
on public.kitchen_psychological_stability
for all
using (
  tenant_id is not null
);

create policy "tenant access kitchen burnout risk"
on public.kitchen_burnout_risk
for all
using (
  tenant_id is not null
);

create index if not exists idx_kitchen_queue_tenant_created
on public.kitchen_queue (tenant_id, created_at desc);

create index if not exists idx_kitchen_queue_chef
on public.kitchen_queue (tenant_id, chef_id);

create index if not exists idx_kitchen_queue_station
on public.kitchen_queue (tenant_id, station);

create index if not exists idx_kitchen_queue_priority
on public.kitchen_queue (tenant_id, priority);

create index if not exists idx_kitchen_tickets_status
on public.kitchen_tickets (tenant_id, status);

create index if not exists idx_kitchen_tickets_created
on public.kitchen_tickets (tenant_id, created_at desc);

create index if not exists idx_kitchen_daily_reports_date
on public.kitchen_daily_reports (tenant_id, report_date desc);

create index if not exists idx_kitchen_predictive_alerts_created
on public.kitchen_predictive_alerts (tenant_id, created_at desc);

create index if not exists idx_kitchen_burnout_created
on public.kitchen_burnout_risk (tenant_id, created_at desc);
