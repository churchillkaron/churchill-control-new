create index if not exists idx_platform_service_usage_org_capability
  on public.platform_service_usage (organization_id, capability);

create or replace function public.get_platform_service_usage_totals(p_organization_id uuid)
returns table (
  capability text,
  quantity numeric,
  customer_price numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    usage.capability,
    coalesce(sum(usage.quantity), 0)::numeric as quantity,
    coalesce(sum(usage.customer_price), 0)::numeric as customer_price
  from public.platform_service_usage as usage
  where usage.organization_id = p_organization_id
  group by usage.capability;
$$;

revoke all on function public.get_platform_service_usage_totals(uuid) from public;
revoke all on function public.get_platform_service_usage_totals(uuid) from anon;
revoke all on function public.get_platform_service_usage_totals(uuid) from authenticated;
grant execute on function public.get_platform_service_usage_totals(uuid) to service_role;
