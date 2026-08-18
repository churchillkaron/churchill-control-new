update provider_pricing
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'video_capabilities', jsonb_build_object(
    'contract', 'PROVIDER_VIDEO_CAPABILITY_CONFIGURATION_V1',
    'supported_resolutions', jsonb_build_array('720p', '1080p', '4k'),
    'auto_resolution_priority', jsonb_build_array('4k', '1080p', '720p'),
    'resolution_options', jsonb_build_array(
      jsonb_build_object('id', '720p', 'label', 'HD', 'short_label', '720p', 'landscape_width', 1280, 'landscape_height', 720, 'portrait_width', 720, 'portrait_height', 1280),
      jsonb_build_object('id', '1080p', 'label', 'Full HD', 'short_label', '1080p', 'landscape_width', 1920, 'landscape_height', 1080, 'portrait_width', 1080, 'portrait_height', 1920),
      jsonb_build_object('id', '4k', 'label', '4K UHD', 'short_label', '4K', 'landscape_width', 3840, 'landscape_height', 2160, 'portrait_width', 2160, 'portrait_height', 3840)
    ),
    'supported_aspect_ratios', jsonb_build_array('16:9', '9:16'),
    'native_frame_rate', 24,
    'native_audio', true,
    'resolution_constraints', jsonb_build_object(
      '1080p', jsonb_build_object('allowed_duration_seconds', jsonb_build_array(8)),
      '4k', jsonb_build_object('allowed_duration_seconds', jsonb_build_array(8))
    ),
    'extension_constraints', jsonb_build_object(
      'supported_resolutions', jsonb_build_array('720p')
    )
  )
)
where provider = 'google-veo'
  and capability = 'ai.video.generate'
  and model = 'veo-3.1-generate-preview'
  and active = true;
