begin;

-- Token-priced services require an explicit, editable reservation envelope.
-- Runtime settlement uses provider-reported actual tokens and releases the
-- unused reservation; these values are not the final customer charge.

update public.provider_pricing
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'estimated_input_tokens_per_request',
      coalesce(
        nullif((metadata ->> 'estimated_input_tokens_per_request')::numeric, 0),
        8000
      ),
    'estimated_output_tokens_per_request',
      coalesce(
        nullif((metadata ->> 'estimated_output_tokens_per_request')::numeric, 0),
        4000
      ),
    'reservation_policy', 'CONFIGURED_TOKEN_CEILING_ACTUAL_SETTLEMENT',
    'reservation_policy_version', 'service-runtime-token-settlement-v1'
  ),
  updated_at = now()
where provider = 'openai'
  and capability = 'ai.image.analyze'
  and model = 'gpt-4.1-mini'
  and active = true
  and (
    coalesce((metadata ->> 'estimated_input_tokens_per_request')::numeric, 0) <= 0
    or coalesce((metadata ->> 'estimated_output_tokens_per_request')::numeric, 0) <= 0
  );

do $$
begin
  if not exists (
    select 1
    from public.provider_pricing
    where provider = 'openai'
      and capability = 'ai.image.analyze'
      and model = 'gpt-4.1-mini'
      and active = true
      and coalesce((metadata ->> 'estimated_input_tokens_per_request')::numeric, 0) > 0
      and coalesce((metadata ->> 'estimated_output_tokens_per_request')::numeric, 0) > 0
  ) then
    raise exception 'OPENAI_ANALYSIS_RESERVATION_PRICING_NOT_CONFIGURED';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
