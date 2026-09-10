-- Entity-scoped atomic recipe replacement with exact UOM conversion and cost recalculation.
alter table public.dishes add column if not exists dish_code text;
create unique index if not exists ux_dishes_org_entity_code
  on public.dishes (organization_id,entity_id,lower(dish_code))
  where organization_id is not null and entity_id is not null and dish_code is not null;

create or replace function public.production_upsert_recipe_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_dish_id uuid,
  p_items jsonb,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_row jsonb;
  v_item record;
  v_uom_id uuid;
  v_quantity numeric;
  v_factor numeric;
  v_total numeric := 0;
  v_count integer := 0;
begin
  if p_organization_id is null or p_entity_id is null or p_dish_id is null or p_actor_id is null then
    raise exception 'organization/entity/dish/actor required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'recipe items required'; end if;
  if not exists (
    select 1 from public.dishes d where d.id=p_dish_id and d.organization_id=p_organization_id and d.entity_id=p_entity_id
  ) then raise exception 'dish unavailable for organization/entity'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('production:recipe:'||p_organization_id::text||':'||p_entity_id::text||':'||p_dish_id::text,0)
  );

  create temporary table if not exists pg_temp.recipe_stage(
    item_id uuid primary key, quantity numeric not null, uom_id uuid, factor numeric not null
  ) on commit drop;
  truncate pg_temp.recipe_stage;

  for v_row in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := nullif(v_row->>'quantity','')::numeric;
    v_uom_id := nullif(v_row->>'uom_id','')::uuid;
    if v_quantity is null or v_quantity<=0 then raise exception 'recipe quantity must be positive'; end if;

    select ii.id,ii.uom_id,coalesce(ii.cost,0) as cost into v_item
    from public.inventory_items ii
    where ii.id=nullif(v_row->>'item_id','')::uuid
      and ii.organization_id=p_organization_id and ii.entity_id=p_entity_id and coalesce(ii.is_active,true);
    if not found then raise exception 'recipe inventory item unavailable'; end if;

    v_factor := null;
    if v_uom_id is null or v_uom_id=v_item.uom_id then
      v_factor := 1;
    else
      select case when su.dimension=bu.dimension and su.dimension is not null and su.dimension<>'PACKAGE'
        and su.factor_to_base is not null and bu.factor_to_base is not null
        then su.factor_to_base/bu.factor_to_base else null end
      into v_factor
      from public.inventory_uoms su join public.inventory_uoms bu on bu.id=v_item.uom_id
      where su.id=v_uom_id and (su.organization_id is null or su.organization_id=p_organization_id);
      if v_factor is null then
        select c.factor_to_item_base into v_factor
        from public.inventory_item_uom_conversions c
        where c.organization_id=p_organization_id and c.entity_id=p_entity_id
          and c.item_id=v_item.id and c.from_uom_id=v_uom_id;
      end if;
    end if;
    if v_factor is null or v_factor<=0 then raise exception 'recipe UOM conversion unresolved for item %',v_item.id; end if;

    insert into pg_temp.recipe_stage(item_id,quantity,uom_id,factor)
      values(v_item.id,v_quantity,v_uom_id,v_factor);
    v_total := v_total + (v_quantity*v_factor*v_item.cost);
    v_count := v_count+1;
  end loop;

  delete from public.recipe_items
  where organization_id=p_organization_id and entity_id=p_entity_id and dish_id=p_dish_id;
  insert into public.recipe_items(organization_id,entity_id,dish_id,item_id,quantity,unit,uom_id)
  select p_organization_id,p_entity_id,p_dish_id,s.item_id,s.quantity,u.abbreviation,s.uom_id
  from pg_temp.recipe_stage s left join public.inventory_uoms u on u.id=s.uom_id;

  update public.dishes set cost=round(v_total,4)
  where organization_id=p_organization_id and entity_id=p_entity_id and id=p_dish_id;

  return jsonb_build_object('success',true,'dish_id',p_dish_id,'item_count',v_count,'total_cost',round(v_total,4));
end;
$$;
revoke all on function public.production_upsert_recipe_atomic(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.production_upsert_recipe_atomic(uuid,uuid,uuid,jsonb,uuid) to service_role;
