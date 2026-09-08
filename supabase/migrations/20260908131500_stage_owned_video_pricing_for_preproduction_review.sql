-- Avantiqo Cinema remains owned-only while LTX 2.5 completes formal production certification.
-- Studio may resolve these rows only through the explicit BENCHMARK_REVIEW_PREVIEW contract.
update public.provider_pricing
set
  active = false,
  updated_at = now(),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'production_routing_allowed', false,
    'benchmark_review_preview_allowed', true,
    'production_certification_not_implied', true,
    'external_provider_fallback_allowed', false,
    'pricing_status', 'MARKET_PARITY_READY',
    'preproduction_review_staged_at', now()
  )
where provider = 'avantiqo-video'
  and capability in (
    'ai.video.generate',
    'ai.video.image_to_video',
    'ai.video.first_last_frame_to_video'
  )
  and upper(coalesce(metadata->>'pricing_status', '')) = 'MARKET_PARITY_READY';
