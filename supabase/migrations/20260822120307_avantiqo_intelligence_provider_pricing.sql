insert into public.provider_pricing (
  provider,
  model,
  capability,
  unit,
  input_cost_per_1m,
  output_cost_per_1m,
  markup_percent,
  active,
  currency,
  metadata
)
select
  'avantiqo-intelligence',
  'Qwen/Qwen3-30B-A3B-Thinking-2507',
  'ai.reasoning.execute',
  'token',
  14.000000,
  250.000000,
  30.000000,
  true,
  'THB',
  jsonb_build_object(
    'managed_by', 'avantiqo',
    'owned_inference', true,
    'infrastructure_provider', 'runpod_serverless',
    'gpu_class', 'RTX_PRO_6000_96GB',
    'gpu_usd_per_hour_reference', 3.49,
    'usd_thb_reference', 35,
    'pricing_basis', 'runpod_gpu_amortized_token_proxy_v1',
    'pricing_status', 'PROVISIONAL_MEASURED_BASELINE',
    'reservation_policy', 'CONFIGURED_TOKEN_CEILING_ACTUAL_SETTLEMENT',
    'reservation_policy_version', 'avantiqo-intelligence-v1',
    'estimated_input_tokens_per_request', 131072,
    'estimated_output_tokens_per_request', 8192,
    'warm_ttft_ms_reference', 340,
    'warm_total_ms_reference', 1531,
    'recalibration_required', true
  )
where not exists (
  select 1
  from public.provider_pricing
  where provider = 'avantiqo-intelligence'
    and model = 'Qwen/Qwen3-30B-A3B-Thinking-2507'
    and capability = 'ai.reasoning.execute'
    and currency = 'THB'
    and active = true
);
