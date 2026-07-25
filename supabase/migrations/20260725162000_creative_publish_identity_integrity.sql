begin;

do $$
begin
  if exists (
    select 1
    from public.creative_asset_nodes
    where type = 'PUBLISH_COMMAND'
      and nullif(metadata->>'publish_command_identity', '') is not null
    group by organization_id, metadata->>'publish_command_identity'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_CREATIVE_PUBLISH_COMMAND_IDENTITIES_REQUIRE_RECONCILIATION';
  end if;

  if exists (
    select 1
    from public.creative_asset_nodes
    where type = 'PUBLISH_EXECUTION'
      and nullif(metadata->>'publish_execution_identity', '') is not null
    group by organization_id, metadata->>'publish_execution_identity'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_CREATIVE_PUBLISH_EXECUTION_IDENTITIES_REQUIRE_RECONCILIATION';
  end if;
end;
$$;

create unique index if not exists creative_publish_command_identity_unique
  on public.creative_asset_nodes (
    organization_id,
    (metadata->>'publish_command_identity')
  )
  where type = 'PUBLISH_COMMAND'
    and nullif(metadata->>'publish_command_identity', '') is not null;

create unique index if not exists creative_publish_execution_identity_unique
  on public.creative_asset_nodes (
    organization_id,
    (metadata->>'publish_execution_identity')
  )
  where type = 'PUBLISH_EXECUTION'
    and nullif(metadata->>'publish_execution_identity', '') is not null;

commit;
