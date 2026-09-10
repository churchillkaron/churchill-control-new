-- Canonical current supplier price: one row per organization/entity/supplier/item.
alter table public.supplier_prices
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists source_attachment_sha256 text,
  add column if not exists source_reference text;

create unique index if not exists ux_supplier_prices_current
  on public.supplier_prices (organization_id, entity_id, supplier_party_id, item_id)
  where organization_id is not null and entity_id is not null
    and supplier_party_id is not null and item_id is not null;

create or replace function public.procurement_import_supplier_prices_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_supplier_party_id uuid,
  p_rows jsonb,
  p_source_attachment_sha256 text,
  p_source_reference text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_item_id uuid;
  v_price numeric;
  v_moq numeric;
  v_existing record;
  v_new integer := 0;
  v_changed integer := 0;
  v_unchanged integer := 0;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organization/entity required'; end if;
  if p_supplier_party_id is null then raise exception 'supplier_party_id required'; end if;
  if p_actor_id is null then raise exception 'actor_id required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'rows required'; end if;

  if not exists (
    select 1 from public.legal_entities le
    where le.organization_id = p_organization_id and le.id = p_entity_id and coalesce(le.is_active,true)
  ) then raise exception 'legal entity unavailable'; end if;

  if not exists (
    select 1 from public.supplier_profiles sp
    where sp.organization_id = p_organization_id and sp.party_id = p_supplier_party_id
      and coalesce(sp.is_active,true) and not coalesce(sp.is_blocked,false)
  ) then raise exception 'supplier unavailable'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('procurement:supplier-price:' || p_organization_id::text || ':' || p_entity_id::text || ':' || p_supplier_party_id::text, 0)
  );

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_item_id := nullif(v_row->>'item_id','')::uuid;
    v_price := nullif(v_row->>'price','')::numeric;
    v_moq := coalesce(nullif(v_row->>'minimum_order_quantity','')::numeric,1);
    if v_item_id is null or v_price is null or v_price < 0 or v_moq <= 0 then
      raise exception 'invalid supplier price row';
    end if;

    if not exists (
      select 1 from public.inventory_items ii
      where ii.organization_id = p_organization_id and ii.entity_id = p_entity_id
        and ii.id = v_item_id and coalesce(ii.is_active,true)
    ) then raise exception 'supplier price item unavailable'; end if;

    select sp.* into v_existing
    from public.supplier_prices sp
    where sp.organization_id = p_organization_id
      and sp.entity_id = p_entity_id
      and sp.supplier_party_id = p_supplier_party_id
      and sp.item_id = v_item_id
    for update;

    if not found then
      insert into public.supplier_prices (
        organization_id, entity_id, supplier_party_id, item_id, price, minimum_order_quantity,
        source_attachment_sha256, source_reference, created_at, updated_at
      ) values (
        p_organization_id, p_entity_id, p_supplier_party_id, v_item_id, v_price, v_moq,
        nullif(btrim(p_source_attachment_sha256),''), nullif(btrim(p_source_reference),''), clock_timestamp(), clock_timestamp()
      );
      v_new := v_new + 1;
    elsif v_existing.price is distinct from v_price
       or v_existing.minimum_order_quantity is distinct from v_moq
       or v_existing.source_attachment_sha256 is distinct from nullif(btrim(p_source_attachment_sha256),'')
       or v_existing.source_reference is distinct from nullif(btrim(p_source_reference),'') then
      update public.supplier_prices
      set price = v_price,
          minimum_order_quantity = v_moq,
          source_attachment_sha256 = nullif(btrim(p_source_attachment_sha256),''),
          source_reference = nullif(btrim(p_source_reference),''),
          updated_at = clock_timestamp()
      where id = v_existing.id;
      v_changed := v_changed + 1;
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  return jsonb_build_object('success',true,'new_count',v_new,'changed_count',v_changed,'unchanged_count',v_unchanged);
end;
$$;

revoke all on function public.procurement_import_supplier_prices_atomic(uuid,uuid,uuid,jsonb,text,text,uuid) from public, anon, authenticated;
grant execute on function public.procurement_import_supplier_prices_atomic(uuid,uuid,uuid,jsonb,text,text,uuid) to service_role;
