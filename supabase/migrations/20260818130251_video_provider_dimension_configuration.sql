update provider_pricing
set metadata = jsonb_set(
  metadata,
  '{video_capabilities,resolution_options}',
  jsonb_build_array(
    jsonb_build_object(
      'id', '720p',
      'label', 'HD',
      'short_label', '720p',
      'dimensions_by_aspect_ratio', jsonb_build_object(
        '16:9', jsonb_build_object('width', 1280, 'height', 720),
        '9:16', jsonb_build_object('width', 720, 'height', 1280)
      )
    ),
    jsonb_build_object(
      'id', '1080p',
      'label', 'Full HD',
      'short_label', '1080p',
      'dimensions_by_aspect_ratio', jsonb_build_object(
        '16:9', jsonb_build_object('width', 1920, 'height', 1080),
        '9:16', jsonb_build_object('width', 1080, 'height', 1920)
      )
    ),
    jsonb_build_object(
      'id', '4k',
      'label', '4K UHD',
      'short_label', '4K',
      'dimensions_by_aspect_ratio', jsonb_build_object(
        '16:9', jsonb_build_object('width', 3840, 'height', 2160),
        '9:16', jsonb_build_object('width', 2160, 'height', 3840)
      )
    )
  ),
  true
)
where metadata ? 'video_capabilities'
  and active = true;
