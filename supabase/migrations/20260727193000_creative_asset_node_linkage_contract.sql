begin;

-- Complete the canonical Creative asset-graph linkage contract omitted by
-- 20260726101400. These columns are emitted by CreativeAssetNode and used by
-- uploaded assets, generated production outputs and derived media moments.

alter table public.creative_asset_nodes
  add column if not exists creative_asset_id uuid,
  add column if not exists production_task_id uuid,
  add column if not exists parent_asset_node_id uuid;

create index if not exists creative_asset_nodes_asset_idx
  on public.creative_asset_nodes (
    organization_id,
    creative_asset_id,
    created_at desc
  )
  where creative_asset_id is not null;

create index if not exists creative_asset_nodes_production_task_idx
  on public.creative_asset_nodes (
    organization_id,
    production_task_id,
    created_at desc
  )
  where production_task_id is not null;

create index if not exists creative_asset_nodes_parent_idx
  on public.creative_asset_nodes (
    organization_id,
    parent_asset_node_id,
    created_at desc
  )
  where parent_asset_node_id is not null;

do $$
begin
  if to_regclass('public.creative_assets') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'creative_asset_nodes_creative_asset_fk'
         and conrelid = 'public.creative_asset_nodes'::regclass
     ) then
    alter table public.creative_asset_nodes
      add constraint creative_asset_nodes_creative_asset_fk
      foreign key (creative_asset_id)
      references public.creative_assets(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'creative_asset_nodes_parent_fk'
      and conrelid = 'public.creative_asset_nodes'::regclass
  ) then
    alter table public.creative_asset_nodes
      add constraint creative_asset_nodes_parent_fk
      foreign key (parent_asset_node_id)
      references public.creative_asset_nodes(id)
      on delete set null
      not valid;
  end if;
end
$$;

comment on column public.creative_asset_nodes.creative_asset_id is
  'Optional canonical uploaded or reusable Creative asset represented by this graph node.';

comment on column public.creative_asset_nodes.production_task_id is
  'Optional production task that generated this node.';

comment on column public.creative_asset_nodes.parent_asset_node_id is
  'Optional upstream graph node from which this immutable node was derived.';

-- Refresh the PostgREST schema cache immediately after the migration so API
-- writes cannot observe the old column contract.
notify pgrst, 'reload schema';

commit;
