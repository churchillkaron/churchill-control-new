-- Studio / Service Runtime production video is Avantiqo-owned only.
-- External providers remain as historical pricing records and may be inspected
-- explicitly for benchmark/research purposes, but they are not eligible for
-- ordinary production video execution.

update public.provider_pricing
set active = false,
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'production_routing_allowed', false,
      'production_disabled_reason', 'AVANTIQO_OWNED_VIDEO_ONLY',
      'production_disabled_at', now(),
      'external_provider_fallback_allowed', false
    )
where capability in (
  'ai.video.generate',
  'ai.video.image_to_video',
  'ai.video.first_last_frame_to_video'
)
  and provider <> 'avantiqo-video'
  and active = true;
