-- AVANTIQO CREATIVE RENDER AND QUALITY EVIDENCE IDENTITY
-- Prevents concurrent duplicate render, QC and repair evidence for the same
-- immutable input identity.

begin;

do $$
begin
  if exists (
    select organization_id, creative_project_id, type, metadata->>'render_identity'
    from public.creative_asset_nodes
    where type = 'FINAL_RENDER'
      and nullif(metadata->>'render_identity', '') is not null
    group by organization_id, creative_project_id, type, metadata->>'render_identity'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_FINAL_RENDER_IDENTITIES_REQUIRE_RECONCILIATION';
  end if;

  if exists (
    select organization_id, creative_project_id, type, metadata->>'perceptual_qc_identity'
    from public.creative_asset_nodes
    where type = 'QUALITY_REPORT'
      and nullif(metadata->>'perceptual_qc_identity', '') is not null
    group by organization_id, creative_project_id, type, metadata->>'perceptual_qc_identity'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_PERCEPTUAL_QC_IDENTITIES_REQUIRE_RECONCILIATION';
  end if;

  if exists (
    select organization_id, creative_project_id, type, metadata->>'repair_identity'
    from public.creative_asset_nodes
    where type = 'REPAIR_PLAN'
      and nullif(metadata->>'repair_identity', '') is not null
    group by organization_id, creative_project_id, type, metadata->>'repair_identity'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_RENDER_REPAIR_IDENTITIES_REQUIRE_RECONCILIATION';
  end if;

  if exists (
    select organization_id, creative_project_id, type, metadata->>'repair_execution_identity'
    from public.creative_asset_nodes
    where type = 'REPAIR_PLAN'
      and nullif(metadata->>'repair_execution_identity', '') is not null
    group by organization_id, creative_project_id, type, metadata->>'repair_execution_identity'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_RENDER_REPAIR_EXECUTION_IDENTITIES_REQUIRE_RECONCILIATION';
  end if;
end;
$$;

create unique index if not exists creative_final_render_identity_uidx
  on public.creative_asset_nodes (
    organization_id,
    creative_project_id,
    (metadata->>'render_identity')
  )
  where type = 'FINAL_RENDER'
    and nullif(metadata->>'render_identity', '') is not null;

create unique index if not exists creative_perceptual_qc_identity_uidx
  on public.creative_asset_nodes (
    organization_id,
    creative_project_id,
    (metadata->>'perceptual_qc_identity')
  )
  where type = 'QUALITY_REPORT'
    and nullif(metadata->>'perceptual_qc_identity', '') is not null;

create unique index if not exists creative_render_repair_identity_uidx
  on public.creative_asset_nodes (
    organization_id,
    creative_project_id,
    (metadata->>'repair_identity')
  )
  where type = 'REPAIR_PLAN'
    and nullif(metadata->>'repair_identity', '') is not null;

create unique index if not exists creative_render_repair_execution_identity_uidx
  on public.creative_asset_nodes (
    organization_id,
    creative_project_id,
    (metadata->>'repair_execution_identity')
  )
  where type = 'REPAIR_PLAN'
    and nullif(metadata->>'repair_execution_identity', '') is not null;

commit;
