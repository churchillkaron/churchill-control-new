-- Apply verified vendor-invoice item costs and recalculate affected dish costs atomically.
create or replace function public.supply_chain_apply_vendor_invoice_costs_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_vendor_invoice_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice record;
  v_line record;
  v_dish record;
  v_component record;
  v_component_factor numeric;
  v_dish_cost numeric;
  v_item_count integer := 0;
  v_dish_count integer := 0;
  v_skipped_old integer := 0;
begin
  if p_organization_id is null or p_entity_id is null or p_vendor_invoice_id is null or p_actor_id is null then
    raise exception 'organization/entity/vendor invoice/actor required';
  end if;
  select * into v_invoice
  from public.vendor_invoices
  where id=p_vendor_invoice_id and organization_id=p_organization_id and entity_id=p_entity_id
  for update;
  if not found then raise exception 'vendor invoice unavailable'; end if;
  if upper(coalesce(v_invoice.status,'')) in ('VOID','CANCELLED','REVERSED') then
    raise exception 'vendor invoice is not valid cost evidence';
  end if;

  if not exists (
    select 1 from public.vendor_invoice_lines vil
    where vil.organization_id=p_organization_id and vil.entity_id=p_entity_id
      and vil.vendor_invoice_id=p_vendor_invoice_id
      and vil.item_id is not null and vil.base_unit_cost is not null
  ) then raise exception 'vendor invoice has no resolved inventory cost evidence'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supply-chain:vendor-invoice-cost:'||p_organization_id::text||':'||p_entity_id::text,0)
  );

  -- Fail closed before any cost mutation if an affected recipe cannot be converted to item base UOM.
  for v_component in
    select ri.*,ii.uom_id as item_uom_id
    from public.recipe_items ri
    join public.inventory_items ii on ii.id=ri.item_id and ii.organization_id=ri.organization_id and ii.entity_id=ri.entity_id
    where ri.organization_id=p_organization_id and ri.entity_id=p_entity_id
      and ri.item_id in (
        select vil.item_id from public.vendor_invoice_lines vil
        where vil.organization_id=p_organization_id and vil.entity_id=p_entity_id
          and vil.vendor_invoice_id=p_vendor_invoice_id and vil.item_id is not null and vil.base_unit_cost is not null
      )
  loop
    v_component_factor := null;
    if v_component.uom_id is null or v_component.uom_id=v_component.item_uom_id then
      v_component_factor := 1;
    else
      select case
        when su.dimension=bu.dimension and su.dimension is not null and su.dimension<>'PACKAGE'
          and su.factor_to_base is not null and bu.factor_to_base is not null
        then su.factor_to_base/bu.factor_to_base
        else null end
      into v_component_factor
      from public.inventory_uoms su
      join public.inventory_uoms bu on bu.id=v_component.item_uom_id
      where su.id=v_component.uom_id;

      if v_component_factor is null then
        select c.factor_to_item_base into v_component_factor
        from public.inventory_item_uom_conversions c
        where c.organization_id=p_organization_id and c.entity_id=p_entity_id
          and c.item_id=v_component.item_id and c.from_uom_id=v_component.uom_id;
      end if;
    end if;
    if v_component_factor is null or v_component_factor<=0 then
      raise exception 'recipe UOM conversion unresolved for dish % item %',v_component.dish_id,v_component.item_id;
    end if;
  end loop;
  -- Apply the newest verified invoice cost per item. Multiple lines are weighted by converted base quantity.
  for v_line in
    select vil.item_id,
      sum((vil.quantity*vil.unit_price)-coalesce(vil.discount_amount,0)) /
        nullif(sum(vil.quantity*vil.factor_to_item_base),0) as base_unit_cost
    from public.vendor_invoice_lines vil
    where vil.organization_id=p_organization_id and vil.entity_id=p_entity_id
      and vil.vendor_invoice_id=p_vendor_invoice_id
      and vil.item_id is not null and vil.factor_to_item_base is not null and vil.factor_to_item_base>0
    group by vil.item_id
  loop
    update public.inventory_items ii
    set cost=round(v_line.base_unit_cost,8),
        cost_source_type='VENDOR_INVOICE',
        cost_source_id=p_vendor_invoice_id,
        cost_source_reference=v_invoice.invoice_number,
        cost_effective_at=v_invoice.invoice_date::timestamptz,
        cost_updated_at=clock_timestamp(),
        updated_at=clock_timestamp()::timestamp
    where ii.organization_id=p_organization_id and ii.entity_id=p_entity_id and ii.id=v_line.item_id
      and coalesce(ii.is_active,true)
      and (ii.cost_effective_at is null or ii.cost_effective_at<=v_invoice.invoice_date::timestamptz);
    if found then v_item_count:=v_item_count+1; else v_skipped_old:=v_skipped_old+1; end if;
  end loop;

  -- Recalculate only dishes that depend on an item actually sourced by this invoice.
  for v_dish in
    select distinct d.id
    from public.dishes d
    join public.recipe_items ri on ri.dish_id=d.id and ri.organization_id=d.organization_id and ri.entity_id=d.entity_id
    where d.organization_id=p_organization_id and d.entity_id=p_entity_id
      and ri.item_id in (
        select vil.item_id from public.vendor_invoice_lines vil
        where vil.organization_id=p_organization_id and vil.entity_id=p_entity_id
          and vil.vendor_invoice_id=p_vendor_invoice_id and vil.item_id is not null and vil.base_unit_cost is not null
      )
  loop
    v_dish_cost := 0;
    for v_component in
      select ri.*,ii.uom_id as item_uom_id,coalesce(ii.cost,0) as item_cost
      from public.recipe_items ri
      join public.inventory_items ii on ii.id=ri.item_id and ii.organization_id=ri.organization_id and ii.entity_id=ri.entity_id
      where ri.organization_id=p_organization_id and ri.entity_id=p_entity_id and ri.dish_id=v_dish.id
    loop
      v_component_factor := null;
      if v_component.uom_id is null or v_component.uom_id=v_component.item_uom_id then
        v_component_factor := 1;
      else
        select case
          when su.dimension=bu.dimension and su.dimension is not null and su.dimension<>'PACKAGE'
            and su.factor_to_base is not null and bu.factor_to_base is not null
          then su.factor_to_base/bu.factor_to_base else null end
        into v_component_factor
        from public.inventory_uoms su
        join public.inventory_uoms bu on bu.id=v_component.item_uom_id
        where su.id=v_component.uom_id;
        if v_component_factor is null then
          select c.factor_to_item_base into v_component_factor
          from public.inventory_item_uom_conversions c
          where c.organization_id=p_organization_id and c.entity_id=p_entity_id
            and c.item_id=v_component.item_id and c.from_uom_id=v_component.uom_id;
        end if;
      end if;
      if v_component_factor is null or v_component_factor<=0 then
        raise exception 'recipe UOM conversion unresolved for dish % item %',v_dish.id,v_component.item_id;
      end if;
      v_dish_cost:=v_dish_cost+(coalesce(v_component.quantity,0)*v_component_factor*v_component.item_cost);
    end loop;
    update public.dishes
    set cost=round(v_dish_cost,4)
    where organization_id=p_organization_id and entity_id=p_entity_id and id=v_dish.id;
    v_dish_count:=v_dish_count+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'vendor_invoice_id',p_vendor_invoice_id,
    'updated_item_count',v_item_count,
    'updated_dish_count',v_dish_count,
    'skipped_older_cost_count',v_skipped_old,
    'cost_source_type','VENDOR_INVOICE'
  );
end;
$$;

revoke all on function public.supply_chain_apply_vendor_invoice_costs_atomic(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.supply_chain_apply_vendor_invoice_costs_atomic(uuid,uuid,uuid,uuid)
  to service_role;
