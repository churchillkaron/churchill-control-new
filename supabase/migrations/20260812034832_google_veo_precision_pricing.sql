insert into public.provider_pricing (
  id,
  provider,
  capability,
  model,
  input_cost_per_1m,
  output_cost_per_1m,
  markup_percent,
  active,
  unit,
  cost_per_unit,
  currency,
  metadata
)
select
  gen_random_uuid(),
  'google-veo',
  'ai.video.generate',
  'veo-3.1-generate-preview',
  0,
  0,
  source.markup_percent,
  true,
  'second',
  source.cost_per_unit * 4,
  source.currency,
  coalesce(source.metadata, '{}'::jsonb) || jsonb_build_object(
    'managed_by', 'avantiqo',
    'canonical_supplier_provider', 'google',
    'pricing_source', 'Google Gemini Developer API pricing',
    'supplier_price_usd_per_second', 0.40,
    'pricing_derivation', 'VEO_STANDARD_4X_GEMINI_OMNI_EFFECTIVE_720P_RATE',
    'native_audio', true,
    'precision_runtime', true,
    'supported_resolutions', jsonb_build_array('720p', '1080p'),
    'default_quantity', 8
  )
from (
  select *
  from public.provider_pricing
  where provider = 'gemini'
    and capability = 'ai.video.generate'
    and model = 'gemini-omni-flash-preview'
    and active = true
  order by created_at desc
  limit 1
) source
where not exists (
  select 1
  from public.provider_pricing existing
  where existing.provider = 'google-veo'
    and existing.capability = 'ai.video.generate'
    and existing.model = 'veo-3.1-generate-preview'
    and existing.active = true
);
