update provider_pricing
set metadata = jsonb_set(
  metadata,
  '{video_capabilities}',
  coalesce(metadata->'video_capabilities', '{}'::jsonb) || jsonb_build_object(
    'allowed_duration_seconds', jsonb_build_array(8),
    'reference_image_limit', 3,
    'extension_constraints', coalesce(metadata->'video_capabilities'->'extension_constraints', '{}'::jsonb) || jsonb_build_object(
      'require_same_provider', true,
      'allowed_source_model_prefixes', jsonb_build_array('veo-3.1')
    )
  ),
  true
)
where metadata ? 'video_capabilities'
  and active = true;
