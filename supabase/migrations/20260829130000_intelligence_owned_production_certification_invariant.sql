-- Prevent owned Avantiqo Intelligence pricing from becoming executable before
-- benchmark and economics certification are both complete.
--
-- This migration does NOT activate, certify, or route either Intelligence lane.
-- It only makes the pre-existing fail-closed policy enforceable at the database
-- boundary so direct SQL or a future script cannot create a contradictory state.

create or replace function public.enforce_avantiqo_intelligence_owned_provider_pricing()
returns trigger
language plpgsql
as $$
declare
  production_routing_allowed boolean := coalesce((new.metadata ->> 'production_routing_allowed')::boolean, false);
  production_certified boolean := coalesce((new.metadata ->> 'production_certified')::boolean, false);
  benchmark_certified boolean := coalesce((new.metadata ->> 'benchmark_certified')::boolean, false);
  economics_certified boolean := coalesce((new.metadata ->> 'economics_certified')::boolean, false);
  recalibration_required boolean := coalesce((new.metadata ->> 'recalibration_required')::boolean, true);
  owned_inference boolean := coalesce((new.metadata ->> 'owned_inference')::boolean, false);
  runtime_compatible boolean := coalesce((new.metadata ->> 'runtime_compatible')::boolean, false);
  model_license_verified boolean := coalesce((new.metadata ->> 'model_license_verified')::boolean, false);
  pricing_status text := upper(coalesce(new.metadata ->> 'pricing_status', ''));
  execution_lane text := lower(coalesce(new.metadata ->> 'execution_lane', ''));
  lane_model_binding text := coalesce(new.metadata ->> 'lane_model_binding', '');
begin
  if new.capability not in ('ai.reasoning.execute', 'ai.text.generate') then
    return new;
  end if;

  if new.provider <> 'avantiqo-intelligence' then
    if new.active is true then
      raise exception 'AVANTIQO_INTELLIGENCE_OWNED_PROVIDER_REQUIRED: capability=%, provider=%',
        new.capability, new.provider
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- A row may remain inactive while it is being benchmarked. The strict
  -- production invariant begins the moment any executable/certified state is
  -- requested.
  if new.active is true or production_routing_allowed or production_certified then
    if pricing_status <> 'PRODUCTION_CERTIFIED'
       or benchmark_certified is not true
       or economics_certified is not true
       or recalibration_required is not false
       or owned_inference is not true
       or runtime_compatible is not true
       or model_license_verified is not true then
      raise exception 'AVANTIQO_INTELLIGENCE_PRODUCTION_CERTIFICATION_REQUIRED: capability=%, pricing_status=%, benchmark_certified=%, economics_certified=%, recalibration_required=%',
        new.capability,
        pricing_status,
        benchmark_certified,
        economics_certified,
        recalibration_required
        using errcode = '23514';
    end if;

    if new.capability = 'ai.text.generate' then
      if new.model is distinct from 'Qwen/Qwen3-30B-A3B-Instruct-2507'
         or execution_lane <> 'fast'
         or lane_model_binding <> 'OWNED_INTELLIGENCE_FAST_V1' then
        raise exception 'AVANTIQO_INTELLIGENCE_FAST_PRODUCTION_BINDING_INVALID: model=%, lane=%, binding=%',
          new.model, execution_lane, lane_model_binding
          using errcode = '23514';
      end if;
    elsif new.capability = 'ai.reasoning.execute' then
      if new.model is distinct from 'Qwen/Qwen3-30B-A3B-Thinking-2507'
         or execution_lane <> 'deep'
         or lane_model_binding <> 'OWNED_INTELLIGENCE_DEEP_V1' then
        raise exception 'AVANTIQO_INTELLIGENCE_DEEP_PRODUCTION_BINDING_INVALID: model=%, lane=%, binding=%',
          new.model, execution_lane, lane_model_binding
          using errcode = '23514';
      end if;
    end if;
  end if;

  if new.active is true and production_routing_allowed is not true then
    raise exception 'AVANTIQO_INTELLIGENCE_ACTIVE_REQUIRES_PRODUCTION_ROUTING: capability=%',
      new.capability
      using errcode = '23514';
  end if;

  if production_routing_allowed is true and new.active is not true then
    raise exception 'AVANTIQO_INTELLIGENCE_PRODUCTION_ROUTING_REQUIRES_ACTIVE: capability=%',
      new.capability
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_avantiqo_intelligence_owned_provider_pricing
  on public.provider_pricing;

create trigger enforce_avantiqo_intelligence_owned_provider_pricing
before insert or update of provider, capability, model, active, metadata
on public.provider_pricing
for each row
execute function public.enforce_avantiqo_intelligence_owned_provider_pricing();
