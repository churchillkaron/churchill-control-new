begin;

alter table public.purchase_orders
  add column if not exists idempotency_key text,
  add column if not exists source_reference text,
  add column if not exists source_attachment_sha256 text;

create unique index if not exists purchase_orders_org_entity_idempotency_key
  on public.purchase_orders (organization_id, entity_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists purchase_orders_org_entity_po_number_key
  on public.purchase_orders (organization_id, entity_id, po_number)
  where po_number is not null;

create or replace function public.create_purchase_order_atomic_rpc(
  p_organization_id uuid,
  p_entity_id uuid,
  p_supplier_party_id uuid,
  p_items jsonb,
  p_ordered_by text,
  p_currency text,
  p_expected_delivery_date date,
  p_notes text,
  p_source_reference text,
  p_source_attachment_sha256 text,
  p_actor_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.purchase_orders%rowtype;
  v_po public.purchase_orders%rowtype;
  v_po_number text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_subtotal numeric := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then raise exception 'organization_id required'; end if;
  if p_entity_id is null then raise exception 'entity_id required'; end if;
  if p_supplier_party_id is null then raise exception 'supplier_party_id required'; end if;
  if p_actor_id is null then raise exception 'actor_id required'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'items required'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'Maximum 500 purchase order items'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','purchase-order',p_organization_id::text,p_entity_id::text,p_idempotency_key),0));

  perform 1 from public.legal_entities where id = p_entity_id and organization_id = p_organization_id;
  if not found then raise exception 'Entity is outside organization scope'; end if;

  perform 1 from public.supplier_profiles
    where organization_id = p_organization_id and party_id = p_supplier_party_id
      and coalesce(is_active,true) is true and coalesce(is_blocked,false) is false;
  if not found then raise exception 'Supplier is unavailable or blocked'; end if;

  select * into v_existing from public.purchase_orders
    where organization_id = p_organization_id and entity_id = p_entity_id and idempotency_key = p_idempotency_key limit 1;
  if found then
    return jsonb_build_object('success',true,'idempotent_replay',true,'purchase_order',to_jsonb(v_existing),
      'items',(select coalesce(jsonb_agg(to_jsonb(poi) order by poi.created_at,poi.id),'[]'::jsonb) from public.purchase_order_items poi where poi.purchase_order_id=v_existing.id));
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce(nullif(v_item->>'qty','')::numeric, nullif(v_item->>'quantity','')::numeric, 0);
    v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric, nullif(v_item->>'price','')::numeric, 0);
    if v_qty <= 0 then raise exception 'Purchase order item quantity must be positive'; end if;
    if v_unit_price < 0 then raise exception 'Purchase order item price cannot be negative'; end if;
    if nullif(btrim(coalesce(v_item->>'item_name',v_item->>'name','')), '') is null and nullif(v_item->>'item_id','') is null then
      raise exception 'Purchase order item name or item_id required';
    end if;
    if nullif(v_item->>'item_id','') is not null then
      v_item_id := (v_item->>'item_id')::uuid;
      perform 1 from public.inventory_items where id=v_item_id and organization_id=p_organization_id and entity_id=p_entity_id and coalesce(is_active,true) is true;
      if not found then raise exception 'Purchase order item is outside organization/entity scope'; end if;
    else
      v_item_id := null;
    end if;
    v_subtotal := v_subtotal + (v_qty * v_unit_price);
  end loop;

  v_po_number := public.finance_next_document_number(p_organization_id,p_entity_id,'PURCHASE_ORDER','PO',current_date);
  insert into public.purchase_orders (
    organization_id,entity_id,po_number,supplier_party_id,status,ordered_by,subtotal,tax_amount,total_amount,currency,
    expected_delivery_date,notes,source_reference,source_attachment_sha256,created_at,updated_at,idempotency_key
  ) values (
    p_organization_id,p_entity_id,v_po_number,p_supplier_party_id,'PENDING_APPROVAL',coalesce(nullif(btrim(p_ordered_by),''),p_actor_id::text),
    v_subtotal,0,v_subtotal,upper(coalesce(nullif(btrim(p_currency),''),'THB')),p_expected_delivery_date,nullif(btrim(p_notes),''),
    nullif(btrim(p_source_reference),''),nullif(btrim(p_source_attachment_sha256),''),now(),now(),p_idempotency_key
  ) returning * into v_po;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce(nullif(v_item->>'qty','')::numeric, nullif(v_item->>'quantity','')::numeric, 0);
    v_unit_price := coalesce(nullif(v_item->>'unit_price','')::numeric, nullif(v_item->>'price','')::numeric, 0);
    v_item_id := nullif(v_item->>'item_id','')::uuid;
    insert into public.purchase_order_items (
      organization_id,entity_id,purchase_order_id,item_id,item_name,qty,unit_price,total_price,received_qty,created_at
    ) values (
      p_organization_id,p_entity_id,v_po.id,v_item_id,nullif(btrim(coalesce(v_item->>'item_name',v_item->>'name','')),''),
      v_qty,v_unit_price,v_qty*v_unit_price,0,now()
    ) returning to_jsonb(purchase_order_items) into v_item;
    v_rows := v_rows || jsonb_build_array(v_item);
  end loop;

  return jsonb_build_object('success',true,'idempotent_replay',false,'purchase_order',to_jsonb(v_po),'items',v_rows);
end;
$$;

revoke all on function public.create_purchase_order_atomic_rpc(uuid,uuid,uuid,jsonb,text,text,date,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.create_purchase_order_atomic_rpc(uuid,uuid,uuid,jsonb,text,text,date,text,text,text,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
