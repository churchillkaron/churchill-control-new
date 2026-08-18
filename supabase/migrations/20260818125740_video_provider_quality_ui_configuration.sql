update provider_pricing
set metadata = jsonb_set(
  metadata,
  '{video_capabilities}',
  coalesce(metadata->'video_capabilities', '{}'::jsonb) || jsonb_build_object(
    'auto_option', jsonb_build_object(
      'id', 'AUTO',
      'label', 'Auto / Best',
      'short_label', 'Auto',
      'description', 'Resolve the preferred supported native quality during generation preflight.'
    )
  ),
  true
)
where metadata ? 'video_capabilities'
  and active = true;
