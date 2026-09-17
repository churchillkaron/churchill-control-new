-- Stage owned local Qwen 4B pricing for governed benchmark certification.
-- This migration does NOT activate production routing.

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
  evidence_head text := lower(coalesce(new.metadata ->> 'certification_repository_head', ''));
  local_qwen boolean := new.model = 'Qwen/Qwen3-4B-GGUF:Q4_K_M';
  required_successes integer := 0;
  observed_successes integer := 0;
begin
  if new.capability not in ('ai.reasoning.execute', 'ai.text.generate') then return new; end if;
  if new.provider <> 'avantiqo-intelligence' then
    if new.active is true then
      raise exception 'AVANTIQO_INTELLIGENCE_OWNED_PROVIDER_REQUIRED: capability=%, provider=%', new.capability, new.provider using errcode = '23514';
    end if;
    return new;
  end if;

  if new.active is true or production_routing_allowed or production_certified then
    if pricing_status <> 'PRODUCTION_CERTIFIED' or benchmark_certified is not true or economics_certified is not true
       or recalibration_required is not false or owned_inference is not true or runtime_compatible is not true
       or model_license_verified is not true then
      raise exception 'AVANTIQO_INTELLIGENCE_PRODUCTION_CERTIFICATION_REQUIRED: capability=%, pricing_status=%, benchmark_certified=%, economics_certified=%, recalibration_required=%', new.capability, pricing_status, benchmark_certified, economics_certified, recalibration_required using errcode = '23514';
    end if;

    if local_qwen then
      required_successes := case when new.capability = 'ai.reasoning.execute' then 3 else 1 end;
      if execution_lane <> 'local_gpu' or lane_model_binding <> 'OWNED_INTELLIGENCE_LOCAL_QWEN4B_V1' then
        raise exception 'AVANTIQO_INTELLIGENCE_LOCAL_QWEN4B_PRODUCTION_BINDING_INVALID: model=%, lane=%, binding=%', new.model, execution_lane, lane_model_binding using errcode = '23514';
      end if;
    elsif new.capability = 'ai.text.generate' then
      required_successes := 1;
      if new.model is distinct from 'Qwen/Qwen3-30B-A3B-Instruct-2507' or execution_lane <> 'fast' or lane_model_binding <> 'OWNED_INTELLIGENCE_FAST_V1' then
        raise exception 'AVANTIQO_INTELLIGENCE_FAST_PRODUCTION_BINDING_INVALID: model=%, lane=%, binding=%', new.model, execution_lane, lane_model_binding using errcode = '23514';
      end if;
    elsif new.capability = 'ai.reasoning.execute' then
      required_successes := 3;
      if new.model is distinct from 'Qwen/Qwen3-30B-A3B-Thinking-2507' or execution_lane <> 'deep' or lane_model_binding <> 'OWNED_INTELLIGENCE_DEEP_V1' then
        raise exception 'AVANTIQO_INTELLIGENCE_DEEP_PRODUCTION_BINDING_INVALID: model=%, lane=%, binding=%', new.model, execution_lane, lane_model_binding using errcode = '23514';
      end if;
    end if;

    if evidence_head !~ '^[0-9a-f]{40}$' then
      raise exception 'AVANTIQO_INTELLIGENCE_CERTIFICATION_REPOSITORY_HEAD_REQUIRED: capability=%', new.capability using errcode = '23514';
    end if;
    select count(*)::integer into observed_successes
    from public.platform_service_usage u
    where u.provider = 'avantiqo-intelligence' and u.capability = new.capability and u.provider_model = new.model
      and upper(coalesce(u.status, '')) = 'SUCCESS' and upper(coalesce(u.execution_status, '')) = 'SUCCESS'
      and coalesce((u.metadata ->> 'benchmark_only')::boolean, false) is true
      and lower(coalesce(u.metadata ->> 'repository_head', '')) = evidence_head
      and u.created_at >= now() - interval '24 hours';
    if observed_successes < required_successes then
      raise exception 'AVANTIQO_INTELLIGENCE_CURRENT_USAGE_EVIDENCE_REQUIRED: capability=%, model=%, repository_head=%, required_successes=%, observed_successes=%', new.capability, new.model, evidence_head, required_successes, observed_successes using errcode = '23514';
    end if;
  end if;

  if new.active is true and production_routing_allowed is not true then
    raise exception 'AVANTIQO_INTELLIGENCE_ACTIVE_REQUIRES_PRODUCTION_ROUTING: capability=%', new.capability using errcode = '23514';
  end if;
  if production_routing_allowed is true and new.active is not true then
    raise exception 'AVANTIQO_INTELLIGENCE_PRODUCTION_ROUTING_REQUIRES_ACTIVE: capability=%', new.capability using errcode = '23514';
  end if;
  return new;
end;
$$;

insert into public.provider_pricing (
  id, provider, model, input_cost_per_1m, output_cost_per_1m, markup_percent,
  active, capability, unit, cost_per_unit, currency, metadata
)
select gen_random_uuid(), 'avantiqo-intelligence', 'Qwen/Qwen3-4B-GGUF:Q4_K_M',
  0, 0, 0, false, capability, 'token', 0, 'THB',
  jsonb_build_object(
    'pricing_status','MARKET_PARITY_READY',
    'pricing_contract','AVANTIQO_OWNED_ZERO_MARGINAL_V1',
    'pricing_mode','ZERO_PRICE','allow_zero_price',true,'zero_price',true,
    'owned_inference',true,'benchmark_certified',true,'economics_certified',true,
    'model_license_verified',true,'runtime_compatible',true,'recalibration_required',false,
    'production_routing_allowed',false,'production_certified',false,
    'execution_lane','local_gpu','lane_model_binding','OWNED_INTELLIGENCE_LOCAL_QWEN4B_V1',
    'infrastructure_provider','AVANTIQO_LOCAL_NODE_V1',
    'configured_lane_model','Qwen/Qwen3-4B-GGUF:Q4_K_M',
    'local_context_tokens',6144,'gpu_class','RTX_2060_6GB',
    'certification_basis','NODE01_RTX2060_QWEN4B_6144_CONTEXT_PRODUCTION_QUEUE_PASS',
    'raw_reasoning_persisted',false
  )
from unnest(array['ai.reasoning.execute'::text,'ai.text.generate'::text]) capability
where not exists (
  select 1 from public.provider_pricing p
  where p.provider='avantiqo-intelligence' and p.capability=capability
    and p.model='Qwen/Qwen3-4B-GGUF:Q4_K_M'
);
