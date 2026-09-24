begin;

insert into public.provider_pricing (
  provider, model, input_cost_per_1m, output_cost_per_1m, markup_percent,
  active, capability, unit, cost_per_unit, currency, metadata
)
select
  'pinterest', 'pinterest-api-v5', 0, 0, 0,
  true, capability, unit, 0, null,
  jsonb_build_object(
    'pricing_mode', 'ZERO_PRICE',
    'allow_zero_price', true,
    'currency_neutral', true,
    'pricing_contract', 'SERVICE_RUNTIME_PROVIDER_PRICING_V1',
    'cost_scope', 'AVANTIQO_API_EXECUTION_ONLY',
    'configured_reason', 'Pinterest API execution is not separately charged by Avantiqo; Pinterest account, network, storage, approval, and any advertising spend remain outside this zero-price declaration.',
    'supplier_billing_required', false,
    'provider_supplier_account_verification_required', false,
    'customer_provider_account_required', true,
    'external_provider_charges_excluded', true,
    'customer_markup_percent', 0
  )
from (values
  ('marketing.pinterest.publish'::text, 'pin_publish'::text),
  ('marketing.pinterest.boards.read'::text, 'read'::text)
) as x(capability, unit)
where not exists (
  select 1 from public.provider_pricing p
  where p.provider='pinterest' and p.capability=x.capability and p.active is true
);

commit;
