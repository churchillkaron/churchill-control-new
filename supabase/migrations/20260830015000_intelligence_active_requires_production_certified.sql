-- Final fail-closed invariant for owned Intelligence routing.
-- An owned Intelligence row cannot be active or production-routable unless
-- production_certified is explicitly true. This migration never activates a row.

create or replace function public.enforce_avantiqo_intelligence_active_requires_production_certified()
returns trigger
language plpgsql
as $$
declare
  production_routing_allowed boolean := coalesce((new.metadata ->> 'production_routing_allowed')::boolean, false);
  production_certified boolean := coalesce((new.metadata ->> 'production_certified')::boolean, false);
begin
  if new.provider = 'avantiqo-intelligence'
     and new.capability in ('ai.text.generate', 'ai.reasoning.execute')
     and (new.active is true or production_routing_allowed is true)
     and production_certified is not true then
    raise exception 'AVANTIQO_INTELLIGENCE_ACTIVE_REQUIRES_PRODUCTION_CERTIFIED: capability=%',
      new.capability
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_avantiqo_intelligence_active_requires_production_certified
  on public.provider_pricing;

create trigger enforce_avantiqo_intelligence_active_requires_production_certified
before insert or update of provider, capability, active, metadata
on public.provider_pricing
for each row
execute function public.enforce_avantiqo_intelligence_active_requires_production_certified();
