-- Avantiqo Synthetic Intelligence is owned/self-hosted only.
-- This migration intentionally does NOT certify or activate the owned model.
-- Activation remains a separate evidence-backed final-release step.

-- The fast text lane serves the non-thinking Instruct model. Keep its inactive
-- pricing row truthful before any later production certification/activation.
update public.provider_pricing
set model = 'Qwen/Qwen3-30B-A3B-Instruct-2507',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'execution_lane', 'fast',
      'reasoning_mode', 'NON_THINKING_ONLY',
      'model_license_verified', true,
      'runtime_compatible', true,
      'owned_inference', true,
      'production_routing_allowed', false,
      'activation_requires_certification', true
    )
where capability = 'ai.text.generate'
  and provider = 'avantiqo-intelligence';

update public.provider_pricing
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'execution_lane', 'deep',
      'reasoning_mode', 'THINKING_REQUIRED',
      'owned_inference', true,
      'production_routing_allowed', false,
      'activation_requires_certification', true
    )
where capability = 'ai.reasoning.execute'
  and provider = 'avantiqo-intelligence';

-- External providers are not allowed to become executable fallbacks for the
-- two Synthetic Intelligence capabilities.
update public.provider_pricing
set active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'production_routing_allowed', false,
      'external_intelligence_fallback_allowed', false,
      'deactivated_reason', 'AVANTIQO_INTELLIGENCE_OWNED_ONLY_POLICY'
    )
where capability in ('ai.reasoning.execute', 'ai.text.generate')
  and provider <> 'avantiqo-intelligence';

update public.organization_services
set default_provider_id = 'avantiqo-intelligence',
    fallback_enabled = false,
    configuration = coalesce(configuration, '{}'::jsonb) || jsonb_build_object(
      'owned_only_required', true,
      'external_fallback_allowed', false,
      'owned_provider', 'avantiqo-intelligence'
    ),
    updated_at = now()
where service_id in ('ai.reasoning.execute', 'ai.text.generate');

create or replace function public.enforce_avantiqo_intelligence_owned_provider_pricing()
returns trigger
language plpgsql
as $$
begin
  if new.active is true
     and new.capability in ('ai.reasoning.execute', 'ai.text.generate')
     and new.provider <> 'avantiqo-intelligence' then
    raise exception 'AVANTIQO_INTELLIGENCE_OWNED_PROVIDER_REQUIRED: capability=%, provider=%',
      new.capability, new.provider
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_avantiqo_intelligence_owned_provider_pricing
  on public.provider_pricing;
create trigger enforce_avantiqo_intelligence_owned_provider_pricing
before insert or update of provider, capability, active
on public.provider_pricing
for each row
execute function public.enforce_avantiqo_intelligence_owned_provider_pricing();
