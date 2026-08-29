-- Avantiqo Music is owned/self-hosted only. External providers must never become executable fallbacks.

update public.provider_pricing
set active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'production_routing_allowed', false,
      'external_music_fallback_allowed', false,
      'deactivated_reason', 'AVANTIQO_MUSIC_OWNED_ONLY_POLICY'
    )
where active = true
  and capability in (
    'ai.music.generate',
    'ai.audio.remix',
    'ai.audio.edit',
    'ai.audio.extend',
    'ai.audio.stems',
    'ai.audio.vocal-correct',
    'ai.audio.elastic-warp',
    'ai.audio.mix',
    'ai.audio.master'
  )
  and provider <> 'avantiqo-audio';

update public.organization_services
set default_provider_id = 'avantiqo-audio',
    fallback_enabled = false,
    configuration = coalesce(configuration, '{}'::jsonb) || jsonb_build_object(
      'owned_only_required', true,
      'external_fallback_allowed', false,
      'owned_provider', 'avantiqo-audio'
    ),
    updated_at = now()
where service_id = 'ai.music.generate';

create or replace function public.enforce_avantiqo_music_owned_provider_pricing()
returns trigger
language plpgsql
as $$
begin
  if new.active is true
     and new.capability in (
       'ai.music.generate',
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

drop trigger if exists enforce_avantiqo_music_owned_provider_pricing on public.provider_pricing;
create trigger enforce_avantiqo_music_owned_provider_pricing
before insert or update of provider, capability, active
on public.provider_pricing
for each row
execute function public.enforce_avantiqo_music_owned_provider_pricing();
