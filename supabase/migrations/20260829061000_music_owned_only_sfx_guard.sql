-- Avantiqo Music/Audio is owned/self-hosted only. SFX must not escape to an external provider while no owned SFX runtime is certified.

update public.provider_pricing
set active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'production_routing_allowed', false,
      'external_music_fallback_allowed', false,
      'external_audio_fallback_allowed', false,
      'deactivated_reason', 'AVANTIQO_MUSIC_OWNED_ONLY_POLICY'
    )
where active = true
  and capability = 'ai.sfx.generate'
  and provider <> 'avantiqo-audio';

update public.organization_services
set fallback_enabled = false,
    configuration = coalesce(configuration, '{}'::jsonb) || jsonb_build_object(
      'owned_only_required', true,
      'external_fallback_allowed', false,
      'availability_status', 'OWNED_RUNTIME_NOT_IMPLEMENTED'
    ),
    updated_at = now()
where service_id = 'ai.sfx.generate';

create or replace function public.enforce_avantiqo_music_owned_provider_pricing()
returns trigger
language plpgsql
as $$
begin
  if new.active is true
     and new.capability in (
       'ai.music.generate',
       'ai.sfx.generate',
       'ai.audio.remix',
       'ai.audio.edit',
       'ai.audio.extend',
       'ai.audio.stems',
       'ai.audio.vocal-correct',
       'ai.audio.elastic-warp',
       'ai.audio.mix',
       'ai.audio.master'
     )
     and new.provider <> 'avantiqo-audio' then
    raise exception 'AVANTIQO_MUSIC_OWNED_PROVIDER_REQUIRED: capability=%, provider=%', new.capability, new.provider
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function public.enforce_avantiqo_music_owned_provider_pricing()
set search_path = '';
