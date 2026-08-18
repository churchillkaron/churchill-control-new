update public.provider_pricing
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'default_resolution', '720p',
  'supported_resolutions', jsonb_build_array('720p', '1080p', '4k'),
  'cost_per_unit_multiplier_by_resolution', jsonb_build_object(
    '720p', 1.0,
    '1080p', 1.0,
    '4k', 1.5
  ),
  'supplier_price_usd_per_second_by_resolution', jsonb_build_object(
    '720p', 0.40,
    '1080p', 0.40,
    '4k', 0.60
  ),
  'resolution_pricing_contract', 'PROVIDER_RESOLUTION_UNIT_PRICING_V1',
  'pricing_source_checked_at', '2026-08-18'
)
where provider = 'google-veo'
  and capability = 'ai.video.generate'
  and model = 'veo-3.1-generate-preview'
  and active = true;
