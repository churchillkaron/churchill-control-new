begin;

create or replace function public.market_touch_policy_revision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := greatest(
    clock_timestamp(),
    old.updated_at + interval '1 microsecond'
  );
  return new;
end;
$$;

drop trigger if exists market_risk_policy_revision_touch
  on public.market_risk_policies;

create trigger market_risk_policy_revision_touch
before update on public.market_risk_policies
for each row
execute function public.market_touch_policy_revision();

drop trigger if exists market_automation_policy_revision_touch
  on public.market_automation_policies;

create trigger market_automation_policy_revision_touch
before update on public.market_automation_policies
for each row
execute function public.market_touch_policy_revision();

revoke all on function public.market_touch_policy_revision()
from public, anon, authenticated;

comment on function public.market_touch_policy_revision() is
  'Makes Markets risk and automation policy updated_at a monotonic database-managed revision for execution fencing.';

commit;
