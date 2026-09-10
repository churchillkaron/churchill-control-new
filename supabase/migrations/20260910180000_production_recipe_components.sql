-- Canonical reusable preparation / sub-recipe graph.
-- BATCH dishes can declare their produced output quantity + UOM and can then be
-- consumed by another recipe through recipe_items.component_dish_id.

alter table public.dishes
  add column if not exists recipe_output_quantity numeric,
  add column if not exists recipe_output_uom_id uuid references public.inventory_uoms(id);

alter table public.dishes
  drop constraint if exists dishes_recipe_output_quantity_positive;
alter table public.dishes
  add constraint dishes_recipe_output_quantity_positive
  check (recipe_output_quantity is null or recipe_output_quantity > 0);

comment on column public.dishes.recipe_output_quantity is
  'Usable output quantity produced by one full recipe batch. Required when this dish is consumed as a reusable preparation/sub-recipe.';
comment on column public.dishes.recipe_output_uom_id is
  'UOM of recipe_output_quantity. Parent recipes convert their requested component quantity into this output UOM.';

alter table public.recipe_items
  add column if not exists component_dish_id uuid references public.dishes(id);

create index if not exists idx_recipe_items_org_entity_component_dish
  on public.recipe_items (organization_id,entity_id,component_dish_id)
  where component_dish_id is not null;

comment on column public.recipe_items.component_dish_id is
  'Optional reusable preparation/sub-recipe reference. New writes require exactly one of item_id or component_dish_id.';

create or replace function public.production_recipe_cost_total_internal(
  p_organization_id uuid,
  p_entity_id uuid,
  p_dish_id uuid,
  p_path uuid[] default array[]::uuid[]
) returns numeric
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_row record;
  v_item record;
  v_component record;
  v_source_uom record;
  v_target_uom record;
  v_factor numeric;
  v_line_cost numeric;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if p_organization_id is null or p_entity_id is null or p_dish_id is null then
    raise exception 'organization/entity/dish required';
  end if;
  if p_dish_id = any(p_path) then
    raise exception 'recipe component cycle detected at %',p_dish_id;
  end if;
  if coalesce(array_length(p_path,1),0) >= 12 then
    raise exception 'recipe component depth exceeds 12';
  end if;
  if not exists (
    select 1 from public.dishes d
    where d.id=p_dish_id and d.organization_id=p_organization_id and d.entity_id=p_entity_id
  ) then
    raise exception 'dish unavailable for organization/entity';
  end if;

  for v_row in
    select ri.item_id,ri.component_dish_id,ri.quantity,ri.uom_id,coalesce(ri.yield_percent,100) as yield_percent
    from public.recipe_items ri
    where ri.organization_id=p_organization_id and ri.entity_id=p_entity_id and ri.dish_id=p_dish_id
    order by ri.id
  loop
    v_count := v_count+1;
    if (v_row.item_id is null) = (v_row.component_dish_id is null) then
      raise exception 'recipe line must reference exactly one inventory item or component recipe';
    end if;
    if v_row.quantity is null or v_row.quantity<=0 or v_row.yield_percent<=0 or v_row.yield_percent>100 then
      raise exception 'invalid recipe component quantity or yield';
    end if;

    if v_row.item_id is not null then
      select ii.id,ii.uom_id,coalesce(ii.cost,0) as cost into v_item
      from public.inventory_items ii
      where ii.id=v_row.item_id and ii.organization_id=p_organization_id
        and ii.entity_id=p_entity_id and coalesce(ii.is_active,true);
      if not found then raise exception 'recipe inventory item unavailable'; end if;

      v_factor := null;
      if v_row.uom_id is null or v_row.uom_id=v_item.uom_id then
        v_factor := 1;
      else
        select case when su.dimension=bu.dimension and su.dimension is not null and su.dimension<>'PACKAGE'
          and su.factor_to_base is not null and bu.factor_to_base is not null
          then su.factor_to_base/bu.factor_to_base else null end
        into v_factor
        from public.inventory_uoms su join public.inventory_uoms bu on bu.id=v_item.uom_id
        where su.id=v_row.uom_id and (su.organization_id is null or su.organization_id=p_organization_id);
        if v_factor is null then
          select c.factor_to_item_base into v_factor
          from public.inventory_item_uom_conversions c
          where c.organization_id=p_organization_id and c.entity_id=p_entity_id
            and c.item_id=v_item.id and c.from_uom_id=v_row.uom_id;
        end if;
      end if;
      if v_factor is null or v_factor<=0 then
        raise exception 'recipe UOM conversion unresolved for item %',v_item.id;
      end if;
      v_line_cost := ((v_row.quantity*v_factor)/(v_row.yield_percent/100))*v_item.cost;
    else
      select d.id,d.dish_code,d.recipe_output_quantity,d.recipe_output_uom_id into v_component
      from public.dishes d
      where d.id=v_row.component_dish_id and d.organization_id=p_organization_id and d.entity_id=p_entity_id;
      if not found then raise exception 'component recipe unavailable for organization/entity'; end if;
      if v_component.recipe_output_quantity is null or v_component.recipe_output_quantity<=0 or v_component.recipe_output_uom_id is null then
        raise exception 'component recipe % needs output quantity and UOM',coalesce(v_component.dish_code,v_component.id::text);
      end if;

      v_factor := null;
      if v_row.uom_id is null or v_row.uom_id=v_component.recipe_output_uom_id then
        v_factor := 1;
      else
        select su.* into v_source_uom from public.inventory_uoms su where su.id=v_row.uom_id;
        select tu.* into v_target_uom from public.inventory_uoms tu where tu.id=v_component.recipe_output_uom_id;
        if v_source_uom.id is not null and v_target_uom.id is not null
          and v_source_uom.dimension=v_target_uom.dimension
          and v_source_uom.dimension is not null and v_source_uom.dimension<>'PACKAGE'
          and v_source_uom.factor_to_base>0 and v_target_uom.factor_to_base>0 then
          v_factor := v_source_uom.factor_to_base/v_target_uom.factor_to_base;
        end if;
      end if;
      if v_factor is null or v_factor<=0 then
        raise exception 'component recipe UOM conversion unresolved for %',coalesce(v_component.dish_code,v_component.id::text);
      end if;
      v_line_cost := (
        ((v_row.quantity*v_factor)/v_component.recipe_output_quantity)/(v_row.yield_percent/100)
      ) * public.production_recipe_cost_total_internal(
        p_organization_id,p_entity_id,v_component.id,p_path||p_dish_id
      );
    end if;
    v_total := v_total+v_line_cost;
  end loop;

  if v_count=0 then raise exception 'dish has no recipe components'; end if;
  return v_total;
end;
$$;

revoke all on function public.production_recipe_cost_total_internal(uuid,uuid,uuid,uuid[])
  from public,anon,authenticated;
grant execute on function public.production_recipe_cost_total_internal(uuid,uuid,uuid,uuid[])
  to service_role;

-- Replace the previous 5-argument RPC instead of creating an overloaded public function.
drop function if exists public.production_upsert_recipe_atomic(uuid,uuid,uuid,jsonb,uuid);

create function public.production_upsert_recipe_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_dish_id uuid,
  p_items jsonb,
  p_actor_id uuid,
  p_output_quantity numeric,
  p_output_uom_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_row jsonb;
  v_item record;
  v_component record;
  v_uom_id uuid;
  v_item_id uuid;
  v_component_dish_id uuid;
  v_quantity numeric;
  v_yield_percent numeric;
  v_factor numeric;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if p_organization_id is null or p_entity_id is null or p_dish_id is null or p_actor_id is null then
    raise exception 'organization/entity/dish/actor required';
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'recipe items required'; end if;
  if (p_output_quantity is null) <> (p_output_uom_id is null) then raise exception 'recipe output quantity and UOM must be supplied together'; end if;
  if p_output_quantity is not null and p_output_quantity<=0 then raise exception 'recipe output quantity must be positive'; end if;
  if not exists (
    select 1 from public.dishes d where d.id=p_dish_id and d.organization_id=p_organization_id and d.entity_id=p_entity_id
  ) then raise exception 'dish unavailable for organization/entity'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('production:recipe:'||p_organization_id::text||':'||p_entity_id::text||':'||p_dish_id::text,0)
  );

  create temporary table if not exists pg_temp.recipe_stage(
    line_no integer primary key,
    item_id uuid,
    component_dish_id uuid,
    quantity numeric not null,
    uom_id uuid,
    yield_percent numeric not null
  ) on commit drop;
  truncate pg_temp.recipe_stage;

  for v_row in select value from jsonb_array_elements(p_items)
  loop
    v_count := v_count+1;
    v_item_id := nullif(v_row->>'item_id','')::uuid;
    v_component_dish_id := nullif(v_row->>'component_dish_id','')::uuid;
    v_quantity := nullif(v_row->>'quantity','')::numeric;
    v_uom_id := nullif(v_row->>'uom_id','')::uuid;
    v_yield_percent := coalesce(nullif(v_row->>'yield_percent','')::numeric,100);
    if (v_item_id is null)=(v_component_dish_id is null) then raise exception 'recipe line must reference exactly one inventory item or component recipe'; end if;
    if v_quantity is null or v_quantity<=0 then raise exception 'recipe quantity must be positive'; end if;
    if v_yield_percent<=0 or v_yield_percent>100 then raise exception 'recipe yield_percent must be > 0 and <= 100'; end if;

    if v_item_id is not null then
      select ii.id,ii.uom_id into v_item from public.inventory_items ii
      where ii.id=v_item_id and ii.organization_id=p_organization_id and ii.entity_id=p_entity_id and coalesce(ii.is_active,true);
      if not found then raise exception 'recipe inventory item unavailable'; end if;
      v_factor := null;
      if v_uom_id is null or v_uom_id=v_item.uom_id then v_factor:=1;
      else
        select case when su.dimension=bu.dimension and su.dimension is not null and su.dimension<>'PACKAGE'
          and su.factor_to_base is not null and bu.factor_to_base is not null
          then su.factor_to_base/bu.factor_to_base else null end into v_factor
        from public.inventory_uoms su join public.inventory_uoms bu on bu.id=v_item.uom_id
        where su.id=v_uom_id and (su.organization_id is null or su.organization_id=p_organization_id);
        if v_factor is null then
          select c.factor_to_item_base into v_factor from public.inventory_item_uom_conversions c
          where c.organization_id=p_organization_id and c.entity_id=p_entity_id and c.item_id=v_item.id and c.from_uom_id=v_uom_id;
        end if;
      end if;
      if v_factor is null or v_factor<=0 then raise exception 'recipe UOM conversion unresolved for item %',v_item.id; end if;
    else
      if v_component_dish_id=p_dish_id then raise exception 'recipe cannot contain itself as a component'; end if;
      select d.id,d.recipe_output_quantity,d.recipe_output_uom_id into v_component from public.dishes d
      where d.id=v_component_dish_id and d.organization_id=p_organization_id and d.entity_id=p_entity_id;
      if not found then raise exception 'component recipe unavailable for organization/entity'; end if;
      if v_component.recipe_output_quantity is null or v_component.recipe_output_quantity<=0 or v_component.recipe_output_uom_id is null then
        raise exception 'component recipe needs output quantity and UOM';
      end if;
    end if;
    insert into pg_temp.recipe_stage(line_no,item_id,component_dish_id,quantity,uom_id,yield_percent)
      values(v_count,v_item_id,v_component_dish_id,v_quantity,v_uom_id,v_yield_percent);
  end loop;

  if p_output_quantity is not null then
    if not exists (
      select 1 from public.inventory_uoms u where u.id=p_output_uom_id and (u.organization_id is null or u.organization_id=p_organization_id)
    ) then raise exception 'recipe output UOM unavailable for organization'; end if;
    update public.dishes set recipe_output_quantity=p_output_quantity,recipe_output_uom_id=p_output_uom_id
    where organization_id=p_organization_id and entity_id=p_entity_id and id=p_dish_id;
  end if;

  delete from public.recipe_items where organization_id=p_organization_id and entity_id=p_entity_id and dish_id=p_dish_id;
  insert into public.recipe_items(organization_id,entity_id,dish_id,item_id,component_dish_id,quantity,unit,uom_id,yield_percent)
  select p_organization_id,p_entity_id,p_dish_id,s.item_id,s.component_dish_id,s.quantity,u.abbreviation,s.uom_id,s.yield_percent
  from pg_temp.recipe_stage s left join public.inventory_uoms u on u.id=s.uom_id
  order by s.line_no;

  v_total := public.production_recipe_cost_total_internal(p_organization_id,p_entity_id,p_dish_id,array[]::uuid[]);
  update public.dishes set cost=round(v_total,4)
  where organization_id=p_organization_id and entity_id=p_entity_id and id=p_dish_id;

  return jsonb_build_object(
    'success',true,'dish_id',p_dish_id,'item_count',v_count,'total_cost',round(v_total,4),
    'recipe_output_quantity',p_output_quantity,'recipe_output_uom_id',p_output_uom_id,
    'cost_basis','CANONICAL_RECIPE_GRAPH_WITH_YIELD_V3'
  );
end;
$$;

revoke all on function public.production_upsert_recipe_atomic(uuid,uuid,uuid,jsonb,uuid,numeric,uuid)
  from public,anon,authenticated;
grant execute on function public.production_upsert_recipe_atomic(uuid,uuid,uuid,jsonb,uuid,numeric,uuid)
  to service_role;

-- Costed batch inventory uses the existing production_batches table. It remains
-- server-owned; this only makes the legal-entity and output-UOM lineage explicit.
alter table public.production_batches
  add column if not exists entity_id uuid,
  add column if not exists uom_id uuid references public.inventory_uoms(id),
  add column if not exists recipe_batch_count numeric,
  add column if not exists cost_basis text;

alter table public.production_batches
  drop constraint if exists production_batches_recipe_batch_count_positive;
alter table public.production_batches
  add constraint production_batches_recipe_batch_count_positive
  check (recipe_batch_count is null or recipe_batch_count > 0);

create index if not exists idx_production_batches_org_entity_dish
  on public.production_batches (organization_id,entity_id,dish_id,produced_at desc);

create or replace function public.production_create_costed_batch_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_dish_id uuid,
  p_recipe_batch_count numeric,
  p_reference_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_dish record;
  v_batch_id uuid;
  v_total_cost numeric;
  v_output_quantity numeric;
begin
  if p_organization_id is null or p_entity_id is null or p_dish_id is null or p_actor_id is null then
    raise exception 'organization/entity/dish/actor required';
  end if;
  if p_recipe_batch_count is null or p_recipe_batch_count<=0 then raise exception 'recipe batch count must be positive'; end if;

  select d.id,d.dish_code,d.production_type,d.recipe_output_quantity,d.recipe_output_uom_id into v_dish
  from public.dishes d
  where d.id=p_dish_id and d.organization_id=p_organization_id and d.entity_id=p_entity_id;
  if not found then raise exception 'dish unavailable for organization/entity'; end if;
  if v_dish.production_type<>'BATCH' then raise exception 'costed prepared production requires a BATCH dish'; end if;
  if v_dish.recipe_output_quantity is null or v_dish.recipe_output_quantity<=0 or v_dish.recipe_output_uom_id is null then
    raise exception 'BATCH dish needs recipe output quantity and UOM';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('production:batch:'||p_organization_id::text||':'||p_entity_id::text||':'||p_dish_id::text,0)
  );

  v_total_cost := public.production_recipe_cost_total_internal(
    p_organization_id,p_entity_id,p_dish_id,array[]::uuid[]
  ) * p_recipe_batch_count;
  v_output_quantity := v_dish.recipe_output_quantity*p_recipe_batch_count;

  insert into public.production_batches(
    organization_id,entity_id,dish_id,quantity,remaining_quantity,total_cost,cost_per_unit,
    produced_at,created_by,reference_id,uom_id,recipe_batch_count,cost_basis
  ) values (
    p_organization_id,p_entity_id,p_dish_id,v_output_quantity,v_output_quantity,round(v_total_cost,4),
    round(v_total_cost/v_output_quantity,8),now(),p_actor_id::text,p_reference_id,
    v_dish.recipe_output_uom_id,p_recipe_batch_count,'CANONICAL_RECIPE_GRAPH_WITH_YIELD_V3'
  ) returning id into v_batch_id;

  return jsonb_build_object(
    'success',true,'batch_id',v_batch_id,'dish_id',p_dish_id,'recipe_batch_count',p_recipe_batch_count,
    'quantity',v_output_quantity,'remaining_quantity',v_output_quantity,'uom_id',v_dish.recipe_output_uom_id,
    'total_cost',round(v_total_cost,4),'cost_per_unit',round(v_total_cost/v_output_quantity,8),
    'cost_basis','CANONICAL_RECIPE_GRAPH_WITH_YIELD_V3'
  );
end;
$$;

revoke all on function public.production_create_costed_batch_atomic(uuid,uuid,uuid,numeric,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.production_create_costed_batch_atomic(uuid,uuid,uuid,numeric,uuid,uuid)
  to service_role;
