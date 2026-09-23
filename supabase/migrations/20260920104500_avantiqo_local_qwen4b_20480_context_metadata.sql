-- Forward-only metadata correction for the measured Node01 local Qwen3 4B envelope.
-- This does not activate production routing and does not alter zero-price economics.

update public.provider_pricing
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'local_context_tokens', 20480,
  'local_deep_output_cap_tokens', 8192,
  'local_fast_output_cap_tokens', 4096,
  'local_front_output_cap_tokens', 640,
  'deep_thinking_enabled', true,
  'single_pass_trusted_prompt_tokens', 6000,
  'hierarchical_local_reasoning_supported', true,
  'hierarchical_trigger_prompt_tokens', 6000,
  'hierarchical_max_chunks', 12,
  'hierarchical_contract', 'AVANTIQO_OPERATOR_LOCAL_HIERARCHICAL_EVIDENCE_V1',
  'measured_gpu_vram_bytes', 4227858431,
  'gpu_class', 'RTX_2060_6GB',
  'certification_basis', 'NODE01_RTX2060_QWEN4B_20480_CONTEXT_HIERARCHICAL_DEEP_PASS',
  'certification_measured_at', '2026-09-20T00:00:00Z',
  'production_routing_allowed', false,
  'production_certified', false,
  'raw_reasoning_persisted', false
),
updated_at = now()
where provider = 'avantiqo-intelligence'
  and model = 'Qwen/Qwen3-4B-GGUF:Q4_K_M'
  and capability in ('ai.reasoning.execute','ai.text.generate')
  and coalesce((metadata ->> 'owned_inference')::boolean, false) is true;
