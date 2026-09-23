-- Align WhatsApp template execution with the governed customer-owned-account
-- zero-price policy already used by normal WhatsApp message delivery.
update public.provider_pricing
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'supplier_billing_required', false,
      'provider_supplier_account_verification_required', false
    ),
    updated_at = now()
where provider = 'whatsapp'
  and capability = 'communication.whatsapp.template'
  and active = true
  and coalesce((metadata ->> 'allow_zero_price')::boolean, false) is true;
