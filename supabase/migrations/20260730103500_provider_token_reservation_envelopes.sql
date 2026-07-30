begin;

-- Token-priced provider rows must carry an explicit editable reservation
-- envelope before Service Runtime can reserve the prepaid wallet. Actual
-- provider usage remains authoritative at settlement and unused reservation
-- is released. These values are configuration data, not runtime constants.

update public.provider_pricing
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'estimated_input_tokens_per_request',
      case
        when coalesce((metadata ->> 'estimated_input_tokens_per_request')::numeric, 0) > 0
          then (metadata ->> 'estimated_input_tokens_per_request')::numeric
        when capability = 'ai.reasoning.execute' then 24000
        when capability = 'ai.image.analyze' then 8000
        else 12000
      end,
    'estimated_output_tokens_per_request',
      case
        when coalesce((metadata ->> 'estimated_output_tokens_per_request')::numeric, 0) > 0
          then (metadata ->> 'estimated_output_tokens_per_request')::numeric
        when capability = 'ai.reasoning.execute' then 12000
        when capability = 'ai.image.analyze' then 4000
        else 6000
      end,
    'reservation_policy', 'CONFIGURED_TOKEN_CEILING_ACTUAL_SETTLEMENT',
    'reservation_policy_version', 'service-runtime-token-settlement-v2',
    'reservation_configuration_source', 'provider_pricing'
  ),
  updated_at = now()
where active = true
  and (
    coalesce(input_cost_per_1m, 0) > 0
    or coalesce(output_cost_per_1m, 0) > 0
  )
  and (
    coalesce((metadata ->> 'estimated_input_tokens_per_request')::numeric, 0) <= 0
    or coalesce((metadata ->> 'estimated_output_tokens_per_request')::numeric, 0) <= 0
  );

do $$
declare
  incomplete_count integer;
begin
  select count(*)
  into incomplete_count
  from public.provider_pricing
  where active = true
    and (
      coalesce(input_cost_per_1m, 0) > 0
      or coalesce(output_cost_per_1m, 0) > 0
    )
    and (
      coalesce((metadata ->> 'estimated_input_tokens_per_request')::numeric, 0) <= 0
      or coalesce((metadata ->> 'estimated_output_tokens_per_request')::numeric, 0) <= 0
    );

  if incomplete_count > 0 then
    raise exception 'ACTIVE_TOKEN_PRICING_RESERVATION_ENVELOPE_INCOMPLETE:%', incomplete_count;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
