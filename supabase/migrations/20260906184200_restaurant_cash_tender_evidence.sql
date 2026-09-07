begin;

create or replace function public.restaurant_settle_table_atomic(
  p_organization_id uuid, p_table_number text, p_amount numeric, p_tendered_amount numeric,
  p_payment_method text, p_partial boolean, p_item_ids uuid[], p_idempotency_key text,
  p_actor_id uuid, p_entity_id uuid, p_application_id text, p_cash_session_id uuid, p_currency_code text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_result jsonb; v_payment_id uuid; v_payment public.payments%rowtype;
  v_method text := upper(pg_catalog.btrim(coalesce(p_payment_method, '')));
  v_paid numeric(18,2) := round(coalesce(p_amount, 0), 2); v_tendered numeric(18,2); v_change numeric(18,2); v_duplicate boolean;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key, '')), '') is null then raise exception 'idempotencyKey required'; end if;
  if v_paid <= 0 then raise exception 'payment amount must be greater than zero'; end if;
  if v_method not in ('CASH','CARD','QR','TRANSFER') then raise exception 'Unsupported restaurant payment method'; end if;
  if v_method = 'CASH' then
    v_tendered := round(coalesce(p_tendered_amount, p_amount), 2);
    if v_tendered < v_paid then raise exception 'Cash received cannot be less than the payment amount'; end if;
    v_change := round(v_tendered - v_paid, 2);
  else v_tendered := v_paid; v_change := 0; end if;
  v_result := public.restaurant_settle_table_atomic(
    p_organization_id => p_organization_id, p_table_number => p_table_number, p_amount => v_paid,
    p_payment_method => v_method, p_partial => p_partial, p_item_ids => p_item_ids,
    p_idempotency_key => p_idempotency_key, p_actor_id => p_actor_id, p_entity_id => p_entity_id,
    p_application_id => p_application_id, p_cash_session_id => p_cash_session_id, p_currency_code => p_currency_code
  );
  v_payment_id := nullif(v_result->>'paymentId', '')::uuid;
  if v_payment_id is null then raise exception 'Atomic restaurant settlement returned no payment identity'; end if;
  select * into v_payment from public.payments
  where id = v_payment_id and organization_id = p_organization_id and entity_id = p_entity_id for update;
  if not found then raise exception 'Restaurant payment not found in selected organization and entity'; end if;
  v_duplicate := coalesce((v_result->>'duplicate')::boolean, false);
  if v_duplicate and v_payment.metadata ? 'cash_tender_evidence_recorded' and
     (abs(coalesce(v_payment.tendered_amount, v_paid) - v_tendered) > 0.01 or abs(coalesce(v_payment.change_amount, 0) - v_change) > 0.01)
  then raise exception 'Idempotency key is already used with different cash tender evidence'; end if;
  update public.payments set tendered_amount = v_tendered, change_amount = v_change,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cash_tender_evidence_recorded', true, 'tendered_amount', v_tendered, 'change_amount', v_change),
    updated_at = now()
  where id = v_payment_id and organization_id = p_organization_id and entity_id = p_entity_id;
  return v_result || jsonb_build_object('tenderedAmount', v_tendered, 'changeAmount', v_change);
end; $$;
revoke all on function public.restaurant_settle_table_atomic(uuid,text,numeric,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.restaurant_settle_table_atomic(uuid,text,numeric,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) to service_role;

create or replace function public.restaurant_close_table_entity_atomic(
  p_organization_id uuid, p_entity_id uuid, p_table_id uuid, p_actor_id uuid default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := now(); v_table public.restaurant_tables%rowtype;
  v_session_ids uuid[] := '{}'::uuid[]; v_blocking_orders integer := 0; v_zero_due_orders integer := 0;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if p_table_id is null then raise exception 'tableId required'; end if;
  perform 1 from public.legal_entities le where le.id = p_entity_id and le.organization_id = p_organization_id and coalesce(le.is_active,true) = true;
  if not found then raise exception 'Selected legal entity is outside the organization or inactive'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || p_entity_id::text || ':restaurant-table-close:' || p_table_id::text, 0));
  select * into v_table from public.restaurant_tables where organization_id = p_organization_id and id = p_table_id for update;
  if not found then raise exception 'Restaurant table not found in this organization'; end if;
  if upper(coalesce(v_table.status,'')) = 'MERGED' or exists (
    select 1 from public.restaurant_table_merges m where m.organization_id = p_organization_id and (m.master_table_id = p_table_id or m.merged_table_id = p_table_id)
  ) then raise exception 'Merged tables must be settled or separated before closure'; end if;
  if exists (
    select 1 from public.table_sessions s where s.organization_id = p_organization_id and s.table_id = p_table_id
      and s.entity_id is distinct from p_entity_id and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED')
  ) or exists (
    select 1 from public.orders o where o.organization_id = p_organization_id and o.table_id = p_table_id
      and o.entity_id is distinct from p_entity_id and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED')
  ) then raise exception 'This physical table still has active service for another legal entity'; end if;
  perform 1 from public.orders o where o.organization_id = p_organization_id and o.entity_id = p_entity_id and o.table_id = p_table_id order by o.id for update;
  update public.orders o set status = 'CLOSED', updated_at = v_now
  where o.organization_id = p_organization_id and o.entity_id = p_entity_id and o.table_id = p_table_id
    and upper(coalesce(o.status,'')) = 'OPEN'
    and greatest(coalesce(o.remaining_balance, coalesce(o.total_amount,o.total,0)-coalesce(o.amount_paid,0)),0) <= 0.01
    and coalesce(o.total_amount,o.total,0) <= 0.01 and coalesce(o.amount_paid,0) <= 0.01
    and upper(coalesce(o.payment_status,'UNPAID')) = 'UNPAID'
    and not exists (select 1 from public.payments p where p.organization_id = p_organization_id and p.entity_id = p_entity_id and p.order_id = o.id and coalesce(p.amount,0) > 0.01 and upper(coalesce(p.status,'')) in ('PAID','COMPLETED','SUCCEEDED','SUCCESS','SETTLED','POSTED'))
    and exists (select 1 from public.restaurant_order_item_corrections c where c.organization_id = p_organization_id and c.entity_id = p_entity_id and c.order_id = o.id and upper(c.correction_type) = 'COMP');
  get diagnostics v_zero_due_orders = row_count;
  select count(*) into v_blocking_orders from public.orders o
  where o.organization_id = p_organization_id and o.entity_id = p_entity_id and o.table_id = p_table_id
    and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID') and (
      upper(coalesce(o.status,'')) not in ('COMPLETED','CLOSED') or
      greatest(coalesce(o.remaining_balance,coalesce(o.total_amount,o.total,0)-coalesce(o.amount_paid,0)),0) > 0.01 or
      (coalesce(o.total_amount,o.total,0) > 0.01 and upper(coalesce(o.payment_status,'UNPAID')) not in ('PAID','SETTLED'))
    );
  if v_blocking_orders > 0 then raise exception 'Table cannot close while active or unpaid orders remain in the selected legal entity'; end if;
  select coalesce(array_agg(s.id order by s.created_at,s.id),'{}'::uuid[]) into v_session_ids from public.table_sessions s
  where s.organization_id = p_organization_id and s.entity_id = p_entity_id and (s.id = v_table.active_session_id or s.table_id = p_table_id)
    and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED');
  if coalesce(array_length(v_session_ids,1),0) > 0 then
    perform 1 from public.table_sessions s where s.organization_id = p_organization_id and s.entity_id = p_entity_id and s.id = any(v_session_ids) order by s.id for update;
    update public.table_sessions s set status='CLOSED', guest_count=0, guests=0, closed_at=coalesce(s.closed_at,v_now), updated_at=v_now
    where s.organization_id=p_organization_id and s.entity_id=p_entity_id and s.id=any(v_session_ids);
  end if;
  update public.restaurant_tables set status='AVAILABLE', current_guests=0, active_session_id=null, updated_at=v_now where organization_id=p_organization_id and id=p_table_id;
  return jsonb_build_object('success',true,'organizationId',p_organization_id,'entityId',p_entity_id,'tableId',p_table_id,'sessionIds',to_jsonb(v_session_ids),'closedSessions',coalesce(array_length(v_session_ids,1),0),'zeroDueCompOrdersClosed',v_zero_due_orders,'status','AVAILABLE','actorId',p_actor_id);
end; $$;
revoke all on function public.restaurant_close_table_entity_atomic(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.restaurant_close_table_entity_atomic(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.restaurant_set_guest_count_entity_atomic(
  p_organization_id uuid, p_entity_id uuid, p_table_id uuid, p_guest_count integer, p_actor_id uuid default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := now(); v_table public.restaurant_tables%rowtype; v_session public.table_sessions%rowtype; v_active_orders integer := 0;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if p_table_id is null then raise exception 'tableId required'; end if;
  if p_guest_count is null or p_guest_count < 0 then raise exception 'guestCount must be a non-negative integer'; end if;
  perform 1 from public.legal_entities le where le.id=p_entity_id and le.organization_id=p_organization_id and coalesce(le.is_active,true)=true;
  if not found then raise exception 'Selected legal entity is outside the organization or inactive'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':restaurant-table-guests:' || p_table_id::text,0));
  select * into v_table from public.restaurant_tables where organization_id=p_organization_id and id=p_table_id for update;
  if not found then raise exception 'Restaurant table not found in this organization'; end if;
  if upper(coalesce(v_table.status,''))='MERGED' or exists (select 1 from public.restaurant_table_merges m where m.organization_id=p_organization_id and (m.master_table_id=p_table_id or m.merged_table_id=p_table_id))
    then raise exception 'Guest count must be managed after separating merged tables'; end if;
  perform 1 from public.orders o where o.organization_id=p_organization_id and o.table_id=p_table_id and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED') order by o.id for update;
  perform 1 from public.table_sessions s where s.organization_id=p_organization_id and (s.id=v_table.active_session_id or s.table_id=p_table_id) and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED') order by s.id for update;
  if exists (select 1 from public.orders o where o.organization_id=p_organization_id and o.table_id=p_table_id and o.entity_id is distinct from p_entity_id and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED'))
     or exists (select 1 from public.table_sessions s where s.organization_id=p_organization_id and (s.id=v_table.active_session_id or s.table_id=p_table_id) and s.entity_id is distinct from p_entity_id and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED'))
    then raise exception 'This physical table still has active service for another legal entity'; end if;
  select count(*) into v_active_orders from public.orders o where o.organization_id=p_organization_id and o.entity_id=p_entity_id and o.table_id=p_table_id and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED');
  if p_guest_count=0 and v_active_orders>0 then raise exception 'Guest count cannot be zero while active orders remain'; end if;
  select * into v_session from public.table_sessions s
  where s.organization_id=p_organization_id and s.entity_id=p_entity_id and (s.id=v_table.active_session_id or s.table_id=p_table_id) and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED')
  order by case when s.id=v_table.active_session_id then 0 else 1 end,s.created_at desc,s.id limit 1;
  if p_guest_count>0 and v_session.id is null then raise exception 'An active table session is required before assigning guests'; end if;
  if v_session.id is not null then
    update public.table_sessions s set guest_count=p_guest_count, guests=p_guest_count, updated_at=v_now
    where s.organization_id=p_organization_id and s.entity_id=p_entity_id and s.id=v_session.id returning * into v_session;
  end if;
  update public.restaurant_tables set current_guests=p_guest_count,
    status=case when p_guest_count>0 or v_session.id is not null then 'OCCUPIED' else 'AVAILABLE' end,
    active_session_id=v_session.id, updated_at=v_now
  where organization_id=p_organization_id and id=p_table_id returning * into v_table;
  return jsonb_build_object('success',true,'organizationId',p_organization_id,'entityId',p_entity_id,'tableId',p_table_id,'sessionId',v_session.id,'guestCount',p_guest_count,'status',v_table.status,'actorId',p_actor_id);
end; $$;
revoke all on function public.restaurant_set_guest_count_entity_atomic(uuid,uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.restaurant_set_guest_count_entity_atomic(uuid,uuid,uuid,integer,uuid) to service_role;

create or replace function public.restaurant_transfer_table_entity_atomic(
  p_organization_id uuid, p_entity_id uuid, p_from_table_id uuid, p_to_table_id uuid, p_actor_id uuid default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz:=now(); v_source public.restaurant_tables%rowtype; v_dest public.restaurant_tables%rowtype;
  v_session_id uuid; v_orders integer:=0; v_sessions integer:=0; v_guests integer:=0; v_has_activity boolean:=false;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if p_from_table_id is null then raise exception 'fromTableId required'; end if;
  if p_to_table_id is null then raise exception 'toTableId required'; end if;
  if p_from_table_id=p_to_table_id then raise exception 'Cannot transfer a table into itself'; end if;
  perform 1 from public.legal_entities le where le.id=p_entity_id and le.organization_id=p_organization_id and coalesce(le.is_active,true)=true;
  if not found then raise exception 'Selected legal entity is outside the organization or inactive'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':restaurant-table-transfer:' || least(p_from_table_id::text,p_to_table_id::text) || ':' || greatest(p_from_table_id::text,p_to_table_id::text),0));
  perform 1 from public.restaurant_tables t where t.organization_id=p_organization_id and t.id=any(array[p_from_table_id,p_to_table_id]) order by t.id for update;
  select * into v_source from public.restaurant_tables where organization_id=p_organization_id and id=p_from_table_id;
  if not found then raise exception 'Source table not found'; end if;
  select * into v_dest from public.restaurant_tables where organization_id=p_organization_id and id=p_to_table_id;
  if not found then raise exception 'Destination table not found'; end if;
  if upper(coalesce(v_source.status,''))='MERGED' or upper(coalesce(v_dest.status,''))='MERGED' or exists (
    select 1 from public.restaurant_table_merges m where m.organization_id=p_organization_id and (m.master_table_id=any(array[p_from_table_id,p_to_table_id]) or m.merged_table_id=any(array[p_from_table_id,p_to_table_id]))
  ) then raise exception 'Merged tables must be separated before transfer'; end if;
  perform 1 from public.orders o where o.organization_id=p_organization_id and o.table_id=any(array[p_from_table_id,p_to_table_id]) and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED') order by o.id for update;
  perform 1 from public.table_sessions s where s.organization_id=p_organization_id and (s.table_id=any(array[p_from_table_id,p_to_table_id]) or s.id=any(array[v_source.active_session_id,v_dest.active_session_id])) and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED') order by s.id for update;
  if exists (select 1 from public.orders o where o.organization_id=p_organization_id and o.table_id=any(array[p_from_table_id,p_to_table_id]) and o.entity_id is distinct from p_entity_id and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED'))
     or exists (select 1 from public.table_sessions s where s.organization_id=p_organization_id and (s.table_id=any(array[p_from_table_id,p_to_table_id]) or s.id=any(array[v_source.active_session_id,v_dest.active_session_id])) and s.entity_id is distinct from p_entity_id and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED'))
    then raise exception 'Transfer blocked because one of these physical tables has active service for another legal entity'; end if;
  if coalesce(v_dest.current_guests,0)>0 or v_dest.active_session_id is not null
     or exists (select 1 from public.orders o where o.organization_id=p_organization_id and o.entity_id=p_entity_id and o.table_id=p_to_table_id and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED'))
     or exists (select 1 from public.table_sessions s where s.organization_id=p_organization_id and s.entity_id=p_entity_id and (s.id=v_dest.active_session_id or s.table_id=p_to_table_id) and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED'))
    then raise exception 'Destination table must be empty; use merge tables instead'; end if;
  update public.orders o set table_id=p_to_table_id, table_number=v_dest.table_number, updated_at=v_now
  where o.organization_id=p_organization_id and o.entity_id=p_entity_id and o.table_id=p_from_table_id and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED');
  get diagnostics v_orders=row_count;
  update public.table_sessions s set table_id=p_to_table_id, table_number=v_dest.table_number, updated_at=v_now
  where s.organization_id=p_organization_id and s.entity_id=p_entity_id and (s.id=v_source.active_session_id or s.table_id=p_from_table_id) and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED');
  get diagnostics v_sessions=row_count;
  select s.id into v_session_id from public.table_sessions s where s.organization_id=p_organization_id and s.entity_id=p_entity_id and s.table_id=p_to_table_id and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED')
  order by case when s.id=v_source.active_session_id then 0 else 1 end,s.created_at desc,s.id limit 1;
  v_guests:=greatest(coalesce(v_source.current_guests,0),0); v_has_activity:=v_guests>0 or v_orders>0 or v_sessions>0 or v_session_id is not null;
  update public.restaurant_tables set status=case when v_has_activity then 'OCCUPIED' else 'AVAILABLE' end,current_guests=v_guests,active_session_id=v_session_id,updated_at=v_now where organization_id=p_organization_id and id=p_to_table_id;
  update public.restaurant_tables set status='AVAILABLE',current_guests=0,active_session_id=null,updated_at=v_now where organization_id=p_organization_id and id=p_from_table_id;
  return jsonb_build_object('success',true,'organizationId',p_organization_id,'entityId',p_entity_id,'fromTableId',p_from_table_id,'toTableId',p_to_table_id,'ordersMoved',v_orders,'sessionsMoved',v_sessions,'guestsMoved',v_guests,'activeSessionId',v_session_id,'actorId',p_actor_id);
end; $$;
revoke all on function public.restaurant_transfer_table_entity_atomic(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.restaurant_transfer_table_entity_atomic(uuid,uuid,uuid,uuid,uuid) to service_role;

create or replace function public.restaurant_merge_table_group_entity_atomic(
  p_organization_id uuid, p_entity_id uuid, p_master_table_id uuid, p_target_table_ids uuid[], p_actor_id uuid default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz:=now(); v_targets uuid[]; v_all uuid[]; v_master public.restaurant_tables%rowtype; v_session_id uuid;
  v_requested integer:=0; v_unique integer:=0; v_tables integer:=0; v_orders integer:=0; v_sessions integer:=0; v_guests integer:=0;
  v_total numeric(18,2):=0; v_has_activity boolean:=false;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if p_master_table_id is null then raise exception 'masterTableId required'; end if;
  perform 1 from public.legal_entities le where le.id=p_entity_id and le.organization_id=p_organization_id and coalesce(le.is_active,true)=true;
  if not found then raise exception 'Selected legal entity is outside the organization or inactive'; end if;
  v_requested:=coalesce(cardinality(p_target_table_ids),0);
  if v_requested=0 then raise exception 'At least one target table is required'; end if;
  if array_position(p_target_table_ids,null) is not null then raise exception 'Target table ids cannot contain null'; end if;
  if p_master_table_id=any(p_target_table_ids) then raise exception 'Cannot merge a table into itself'; end if;
  select array_agg(distinct x order by x),count(distinct x) into v_targets,v_unique from unnest(p_target_table_ids) x;
  if v_unique<>v_requested then raise exception 'Target table ids must be unique'; end if;
  v_all:=array_prepend(p_master_table_id,v_targets);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':restaurant-table-group-merge:' || array_to_string(array(select x::text from unnest(v_all) x order by x),':'),0));
  perform 1 from public.restaurant_tables t where t.organization_id=p_organization_id and t.id=any(v_all) order by t.id for update;
  select count(*) into v_tables from public.restaurant_tables t where t.organization_id=p_organization_id and t.id=any(v_all);
  if v_tables<>cardinality(v_all) then raise exception 'One or more tables were not found in this organization'; end if;
  select * into v_master from public.restaurant_tables where organization_id=p_organization_id and id=p_master_table_id;
  if upper(coalesce(v_master.status,''))='MERGED' or exists (select 1 from public.restaurant_table_merges m where m.organization_id=p_organization_id and m.merged_table_id=p_master_table_id)
    then raise exception 'Master table is merged into another table'; end if;
  if exists (select 1 from public.restaurant_tables t where t.organization_id=p_organization_id and t.id=any(v_targets) and upper(coalesce(t.status,''))='MERGED')
     or exists (select 1 from public.restaurant_table_merges m where m.organization_id=p_organization_id and (m.master_table_id=any(v_targets) or m.merged_table_id=any(v_targets)))
    then raise exception 'One or more target tables already belong to a merged group'; end if;
  perform 1 from public.orders o where o.organization_id=p_organization_id and o.table_id=any(v_all) and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED') order by o.id for update;
  perform 1 from public.table_sessions s where s.organization_id=p_organization_id and (s.table_id=any(v_all) or s.id in (select t.active_session_id from public.restaurant_tables t where t.organization_id=p_organization_id and t.id=any(v_all) and t.active_session_id is not null)) and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED') order by s.id for update;
  if exists (select 1 from public.orders o where o.organization_id=p_organization_id and o.table_id=any(v_all) and o.entity_id is distinct from p_entity_id and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED'))
     or exists (select 1 from public.table_sessions s where s.organization_id=p_organization_id and (s.table_id=any(v_all) or s.id in (select t.active_session_id from public.restaurant_tables t where t.organization_id=p_organization_id and t.id=any(v_all) and t.active_session_id is not null)) and s.entity_id is distinct from p_entity_id and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED'))
    then raise exception 'Merge blocked because one or more physical tables have active service for another legal entity'; end if;
  if exists (
    select 1 from public.orders o where o.organization_id=p_organization_id and o.entity_id=p_entity_id and o.table_id=any(v_all)
      and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED') and (
        coalesce(o.amount_paid,0)>0 or upper(coalesce(o.payment_status,'UNPAID')) in ('PARTIAL','PARTIALLY_PAID','PAID','SETTLED') or
        exists (select 1 from public.restaurant_payment_allocations a where a.organization_id=p_organization_id and a.order_id=o.id)
      )
  ) then raise exception 'Cannot merge tables after payment allocation has started'; end if;
  select count(*),round(coalesce(sum(coalesce(o.total_amount,o.total,0)),0)::numeric,2) into v_orders,v_total from public.orders o
  where o.organization_id=p_organization_id and o.entity_id=p_entity_id and o.table_id=any(v_all) and upper(coalesce(o.status,'')) not in ('CANCELLED','CANCELED','VOID','CLOSED','COMPLETED');
  select count(*) into v_sessions from public.table_sessions s where s.organization_id=p_organization_id and s.entity_id=p_entity_id and s.table_id=any(v_all) and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED');
  select coalesce(sum(greatest(coalesce(t.current_guests,0),0)),0)::integer into v_guests from public.restaurant_tables t where t.organization_id=p_organization_id and t.id=any(v_all);
  select s.id into v_session_id from public.table_sessions s where s.organization_id=p_organization_id and s.entity_id=p_entity_id and (s.table_id=any(v_all) or s.id=v_master.active_session_id) and upper(coalesce(s.status,'')) not in ('CLOSED','COMPLETED','CANCELLED')
  order by case when s.id=v_master.active_session_id then 0 when s.table_id=p_master_table_id then 1 else 2 end,s.created_at desc,s.id limit 1;
  insert into public.restaurant_table_merges(organization_id,master_table_id,merged_table_id) select p_organization_id,p_master_table_id,x from unnest(v_targets) x;
  v_has_activity:=v_guests>0 or v_orders>0 or v_sessions>0;
  update public.restaurant_tables set status=case when v_has_activity then 'OCCUPIED' else 'AVAILABLE' end,current_guests=v_guests,active_session_id=v_session_id,updated_at=v_now where organization_id=p_organization_id and id=p_master_table_id;
  update public.restaurant_tables set status='MERGED',current_guests=0,active_session_id=null,updated_at=v_now where organization_id=p_organization_id and id=any(v_targets);
  return jsonb_build_object('success',true,'organizationId',p_organization_id,'entityId',p_entity_id,'masterTableId',p_master_table_id,'mergedTableIds',to_jsonb(v_targets),'mergedTables',cardinality(v_targets),'activeOrders',v_orders,'activeSessions',v_sessions,'totalGuests',v_guests,'totalAmount',v_total,'activeSessionId',v_session_id,'actorId',p_actor_id);
end; $$;
revoke all on function public.restaurant_merge_table_group_entity_atomic(uuid,uuid,uuid,uuid[],uuid) from public, anon, authenticated;
grant execute on function public.restaurant_merge_table_group_entity_atomic(uuid,uuid,uuid,uuid[],uuid) to service_role;

commit;
