-- Govern Facebook Messenger and Instagram messaging provider execution explicitly.
-- These rows represent API-management supplier cost only. They must not be used
-- to model advertising/media spend or any future supplier tariff.
-- If a paid active pricing row is configured later, this migration will not replace it.

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
  'facebook_messenger',
  'meta-messenger-api',
  0,
  0,
  0,
  true,
  'communication.facebook.messenger.send',
  'request',
  0,
  null,
  jsonb_build_object(
    'cost_scope', 'API_MANAGEMENT_ONLY',
    'managed_by', 'avantiqo',
    'pricing_mode', 'ZERO_PRICE',
    'pricing_basis', 'META_MESSAGING_PROVIDER_REQUEST',
    'quota_governed', true,
    'allow_zero_price', true,
    'currency_neutral', true,
    'configured_reason', 'Explicit zero-price governance row; change centrally if supplier or platform pricing applies',
    'supplier_billing_required', false,
    'current_commercial_charge_scope', 'NONE',
    'customer_direct_provider_billing_allowed', false,
    'customer_provider_payment_method_allowed', false,
    'provider_supplier_account_verification_required', false
  )
where not exists (
  select 1
  from public.provider_pricing existing
  where existing.provider = 'facebook_messenger'
    and existing.capability = 'communication.facebook.messenger.send'
    and existing.active is true
);

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
  'instagram_messaging',
  'meta-instagram-messaging-api',
  0,
  0,
  0,
  true,
  'communication.instagram.send',
  'request',
  0,
  null,
  jsonb_build_object(
    'cost_scope', 'API_MANAGEMENT_ONLY',
    'managed_by', 'avantiqo',
    'pricing_mode', 'ZERO_PRICE',
    'pricing_basis', 'META_MESSAGING_PROVIDER_REQUEST',
    'quota_governed', true,
    'allow_zero_price', true,
    'currency_neutral', true,
    'configured_reason', 'Explicit zero-price governance row; change centrally if supplier or platform pricing applies',
    'supplier_billing_required', false,
    'current_commercial_charge_scope', 'NONE',
    'customer_direct_provider_billing_allowed', false,
    'customer_provider_payment_method_allowed', false,
    'provider_supplier_account_verification_required', false
  )
where not exists (
  select 1
  from public.provider_pricing existing
  where existing.provider = 'instagram_messaging'
    and existing.capability = 'communication.instagram.send'
    and existing.active is true
);
