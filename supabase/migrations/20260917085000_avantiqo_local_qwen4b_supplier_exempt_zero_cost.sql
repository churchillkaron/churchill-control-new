-- Mark owned Node 01 Qwen pricing as explicitly supplier-exempt zero-cost.
-- Rows remain inactive and not production-routable.
update public.provider_pricing
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'supplier_billing_required', false,
  'provider_supplier_account_verification_required', false
)
where provider = 'avantiqo-intelligence'
  and model = 'Qwen/Qwen3-4B-GGUF:Q4_K_M'
  and capability in ('ai.reasoning.execute','ai.text.generate')
  and active = false
  and coalesce((metadata ->> 'production_routing_allowed')::boolean, false) is false;
