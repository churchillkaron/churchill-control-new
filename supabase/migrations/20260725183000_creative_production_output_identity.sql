-- AVANTIQO CREATIVE PRODUCTION OUTPUT EVIDENCE IDENTITY
-- Ensures callback retries and synchronous completion recover one canonical
-- asset graph node for the same stored provider output.

begin;

do $$
begin
  if exists (
    select 1
    from public.creative_asset_nodes
    where nullif(metadata->>'production_output_identity', '') is not null
    group by organization_id, metadata->>'production_output_identity'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_CREATIVE_PRODUCTION_OUTPUT_IDENTITIES_REQUIRE_RECONCILIATION';
  end if;
end;
$$;

create unique index if not exists creative_asset_nodes_production_output_identity_uidx
on public.creative_asset_nodes (
  organization_id,
  (metadata->>'production_output_identity')
)
where nullif(metadata->>'production_output_identity', '') is not null;

commit;
