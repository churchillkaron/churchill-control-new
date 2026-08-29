-- Avantiqo Voice is owned/self-hosted only.
-- External speech providers must never become executable fallbacks.
-- This migration intentionally does NOT certify or activate an owned capability.

update public.provider_pricing
set active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'production_routing_allowed', false,
      'external_voice_fallback_allowed', false,
      'deactivated_reason', 'AVANTIQO_VOICE_OWNED_ONLY_POLICY'
    )
where capability in (
    'ai.speech.to.text',
    'ai.speech.to.text.realtime',
    'ai.text.to.speech'
  )
  and provider <> 'avantiqo-voice';

update public.organization_services
set default_provider_id = 'avantiqo-voice',
    fallback_enabled = false,
    configuration = coalesce(configuration, '{}'::jsonb) || jsonb_build_object(
      'owned_only_required', true,
      'external_fallback_allowed', false,
      'owned_provider', 'avantiqo-voice'
    ),
    updated_at = now()
where service_id in (
  'ai.speech.to.text',
  'ai.speech.to.text.realtime',
  'ai.text.to.speech'
);

create or replace function public.enforce_avantiqo_voice_owned_provider_pricing()
returns trigger
language plpgsql
as $$
begin
  if new.active is true
     and new.capability in (
       'ai.speech.to.text',
       'ai.speech.to.text.realtime',
       'ai.text.to.speech'
     )
     and new.provider <> 'avantiqo-voice' then
    raise exception 'AVANTIQO_VOICE_OWNED_PROVIDER_REQUIRED: capability=%, provider=%',
      new.capability, new.provider
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_avantiqo_voice_owned_provider_pricing
  on public.provider_pricing;
create trigger enforce_avantiqo_voice_owned_provider_pricing
before insert or update of provider, capability, active
on public.provider_pricing
for each row
execute function public.enforce_avantiqo_voice_owned_provider_pricing();
