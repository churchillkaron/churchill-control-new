create or replace function public.import_inventory_items_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_rows jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row_count integer;
  v_created jsonb;
  v_existing jsonb;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'INVENTORY_IMPORT_SCOPE_REQUIRED';
  end if;

  perform 1
  from public.legal_entities e
  where e.id = p_entity_id
    and e.organization_id = p_organization_id
    and coalesce(e.is_active, true) = true;
  if not found then raise exception 'INVENTORY_IMPORT_ENTITY_SCOPE_MISMATCH'; end if;

  if jsonb_typeof(p_rows) <> 'array' then raise exception 'INVENTORY_IMPORT_ROWS_ARRAY_REQUIRED'; end if;
  v_row_count := jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 500 then raise exception 'INVENTORY_IMPORT_ROW_LIMIT'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where btrim(coalesce(r->>'code','')) = '' or btrim(coalesce(r->>'name','')) = ''
  ) then raise exception 'INVENTORY_IMPORT_CODE_AND_NAME_REQUIRED'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) r
    group by lower(btrim(r->>'code'))
    having count(*) > 1
  ) then raise exception 'INVENTORY_IMPORT_DUPLICATE_CODE_IN_PAYLOAD'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where coalesce(nullif(r->>'cost','')::numeric, 0) < 0
       or coalesce(nullif(r->>'sale_price','')::numeric, 0) < 0
  ) then raise exception 'INVENTORY_IMPORT_NEGATIVE_AMOUNT'; end if;

  lock table public.inventory_items in share row exclusive mode;

  if exists (
    select 1
    from public.inventory_items i
    join jsonb_array_elements(p_rows) r
      on lower(btrim(i.code)) = lower(btrim(r->>'code'))
    where i.organization_id = p_organization_id and i.entity_id = p_entity_id
    group by lower(btrim(i.code))
    having count(*) > 1
  ) then raise exception 'INVENTORY_IMPORT_AMBIGUOUS_EXISTING_CODE'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'name', i.name) order by i.code), '[]'::jsonb)
  into v_existing
  from public.inventory_items i
  join jsonb_array_elements(p_rows) r on lower(btrim(i.code)) = lower(btrim(r->>'code'))
  where i.organization_id = p_organization_id and i.entity_id = p_entity_id;

  with inserted as (
    insert into public.inventory_items (organization_id, entity_id, name, code, type, cost, sale_price, is_active)
    select
      p_organization_id,
      p_entity_id,
      btrim(r->>'name'),
      btrim(r->>'code'),
      upper(coalesce(nullif(btrim(r->>'type'), ''), 'RAW_MATERIAL')),
      coalesce(nullif(r->>'cost','')::numeric, 0),
      coalesce(nullif(r->>'sale_price','')::numeric, 0),
      true
    from jsonb_array_elements(p_rows) r
    where not exists (
      select 1 from public.inventory_items i
      where i.organization_id = p_organization_id
        and i.entity_id = p_entity_id
        and lower(btrim(i.code)) = lower(btrim(r->>'code'))
    )
    returning id, code, name
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name) order by code), '[]'::jsonb)
  into v_created from inserted;

  return jsonb_build_object(
    'status', 'COMPLETED',
    'input_count', v_row_count,
    'created_count', jsonb_array_length(v_created),
    'existing_count', jsonb_array_length(v_existing),
    'created', v_created,
    'existing', v_existing
  );
end;
$$;

revoke all on function public.import_inventory_items_atomic(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_inventory_items_atomic(uuid, uuid, jsonb) to service_role;
