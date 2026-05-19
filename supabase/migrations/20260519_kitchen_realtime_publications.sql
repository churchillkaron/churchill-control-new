alter publication supabase_realtime add table public.kitchen_queue;
alter publication supabase_realtime add table public.kitchen_tickets;
alter publication supabase_realtime add table public.kitchen_predictive_alerts;
alter publication supabase_realtime add table public.kitchen_daily_reports;
alter publication supabase_realtime add table public.kitchen_monthly_reports;
alter publication supabase_realtime add table public.kitchen_executive_reports;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_kitchen_queue_updated_at
on public.kitchen_queue;

create trigger trg_kitchen_queue_updated_at
before update
on public.kitchen_queue
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_kitchen_tickets_updated_at
on public.kitchen_tickets;

create trigger trg_kitchen_tickets_updated_at
before update
on public.kitchen_tickets
for each row
execute function public.touch_updated_at();

create index if not exists idx_kitchen_queue_live_screen
on public.kitchen_queue (
  tenant_id,
  status,
  priority,
  station
);

create index if not exists idx_kitchen_queue_live_chef
on public.kitchen_queue (
  tenant_id,
  chef_id,
  status
);

create index if not exists idx_kitchen_queue_live_created
on public.kitchen_queue (
  tenant_id,
  created_at desc
);

create index if not exists idx_kitchen_ticket_live
on public.kitchen_tickets (
  tenant_id,
  status,
  created_at desc
);
