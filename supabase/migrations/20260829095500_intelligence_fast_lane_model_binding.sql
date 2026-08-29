begin;

update public.provider_pricing
set
  model = 'Qwen/Qwen3-30B-A3B-Instruct-2507',
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'execution_lane', 'fast',
      'configured_lane_model', 'Qwen/Qwen3-30B-A3B-Instruct-2507',
      'lane_model_binding', 'OWNED_INTELLIGENCE_FAST_V1',
      'estimated_input_tokens_per_request', 131072,
      'estimated_output_tokens_per_request', 8192,
      'reservation_policy', 'CONFIGURED_TOKEN_CEILING_ACTUAL_SETTLEMENT',
      'updated_reason', 'OWNED_INTELLIGENCE_FAST_LANE_MODEL_BINDING'
    )
where provider = 'avantiqo-intelligence'
  and capability = 'ai.text.generate'
  and active = false;

update public.provider_pricing
set
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'execution_lane', 'deep',
      'configured_lane_model', 'Qwen/Qwen3-30B-A3B-Thinking-2507',
      'lane_model_binding', 'OWNED_INTELLIGENCE_DEEP_V1',
      'updated_reason', 'OWNED_INTELLIGENCE_DEEP_LANE_MODEL_BINDING'
    )
where provider = 'avantiqo-intelligence'
  and capability = 'ai.reasoning.execute'
  and model = 'Qwen/Qwen3-30B-A3B-Thinking-2507'
  and active = false;

commit;
