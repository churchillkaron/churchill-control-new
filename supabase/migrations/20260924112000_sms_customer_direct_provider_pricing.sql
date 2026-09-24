begin;

-- SMS is an organization-owned provider account. Twilio bills the organization directly.
-- This row governs Avantiqo execution at zero platform/provider charge; it does not claim
-- that Twilio or carrier messaging itself is free.
insert into public.provider_pricing (
  provider,
  model,
  input_cost_per_1m,
  output_cost_per_1m,
  markup_percent,
  active,
  capability,
  unit,
  cost_per_unit,
  currency,
  metadata
)
select
  'sms',
  'twilio-programmable-messaging',
  0,
  0,
  0,
  true,
  'communication.sms.send',
  'message',
  0,
  'USD',
  jsonb_build_object(
    'pricing_mode', 'ZERO_PRICE',
    'allow_zero_price', true,
    'zero_price', true,
    'cost_scope', 'AVANTIQO_EXECUTION_CHARGE_ONLY',
    'configured_reason', 'Customer-owned Twilio account; Twilio/carrier charges are billed directly to the organization and are not resold by Avantiqo',
    'supplier_billing_required', false,
    'provider_supplier_account_verification_required', false,
    'customer_direct_provider_billing_allowed', true,
    'customer_provider_payment_method_allowed', true,
    'external_provider_billing', true,
    'provider_cost_billed_directly_to_customer', true,
    'avantiqo_customer_price', 0
  )
where not exists (
  select 1
  from public.provider_pricing existing
  where existing.provider = 'sms'
    and existing.capability = 'communication.sms.send'
    and existing.active is true
);

commit;
