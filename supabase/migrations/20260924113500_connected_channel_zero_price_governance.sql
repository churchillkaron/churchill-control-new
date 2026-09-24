begin;

-- Bring legacy customer-owned mailbox pricing under the current explicit supplier-exempt guard.
update public.provider_pricing
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'provider_supplier_account_verification_required', false
)
where provider in ('email_google', 'email_microsoft', 'email_imap')
  and active is true
  and coalesce((metadata->>'allow_zero_price')::boolean, false) is true
  and coalesce((metadata->>'supplier_billing_required')::boolean, true) is false;

-- Telegram Bot API itself is not separately charged by Avantiqo.
insert into public.provider_pricing (
  provider, model, input_cost_per_1m, output_cost_per_1m, markup_percent,
  active, capability, unit, cost_per_unit, currency, metadata
)
select
  'telegram', 'telegram-bot-api', 0, 0, 0,
  true, 'communication.telegram.send', 'message', 0, null,
  jsonb_build_object(
    'pricing_mode', 'ZERO_PRICE',
    'allow_zero_price', true,
    'currency_neutral', true,
    'pricing_contract', 'SERVICE_RUNTIME_PROVIDER_PRICING_V1',
    'cost_scope', 'AVANTIQO_API_EXECUTION_ONLY',
    'configured_reason', 'Telegram Bot API execution is not separately charged by Avantiqo; connectivity, storage, network, or other external costs remain outside this zero-price declaration.',
    'supplier_billing_required', false,
    'provider_supplier_account_verification_required', false,
    'customer_provider_account_required', true,
    'external_provider_charges_excluded', true,
    'customer_markup_percent', 0
  )
where not exists (
  select 1 from public.provider_pricing p
  where p.provider='telegram' and p.capability='communication.telegram.send' and p.active is true
);

-- YouTube Data API quota usage is not separately charged by Avantiqo.
insert into public.provider_pricing (
  provider, model, input_cost_per_1m, output_cost_per_1m, markup_percent,
  active, capability, unit, cost_per_unit, currency, metadata
)
select
  'youtube', 'youtube-data-api-v3', 0, 0, 0,
  true, capability, unit, 0, null,
  jsonb_build_object(
    'pricing_mode', 'ZERO_PRICE',
    'allow_zero_price', true,
    'currency_neutral', true,
    'pricing_contract', 'SERVICE_RUNTIME_PROVIDER_PRICING_V1',
    'cost_scope', 'AVANTIQO_API_EXECUTION_ONLY',
    'configured_reason', 'YouTube Data API execution is not separately charged by Avantiqo; Google/YouTube account, network, storage, verification, and quota constraints remain outside this zero-price declaration.',
    'supplier_billing_required', false,
    'provider_supplier_account_verification_required', false,
    'customer_provider_account_required', true,
    'external_provider_charges_excluded', true,
    'customer_markup_percent', 0
  )
from (values
  ('marketing.youtube.publish'::text, 'video_publish'::text),
  ('marketing.youtube.analytics'::text, 'read'::text)
) as x(capability, unit)
where not exists (
  select 1 from public.provider_pricing p
  where p.provider='youtube' and p.capability=x.capability and p.active is true
);

commit;
