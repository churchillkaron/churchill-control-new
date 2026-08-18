update provider_pricing
set metadata = jsonb_set(
  metadata,
  '{video_capabilities,selection_priority}',
  to_jsonb(100),
  true
)
where metadata ? 'video_capabilities'
  and active = true;
