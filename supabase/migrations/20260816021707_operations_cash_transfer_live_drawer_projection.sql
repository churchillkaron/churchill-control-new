-- Controlled cash transfer executor.
-- Drawer availability is always recalculated from posted transactional evidence before cash may leave the drawer.

create or replace function public.pos_expected_cash_live(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_session_id uuid
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application_id text := lower(pg_catalog.btrim(coalesce(p_application_id,'')));
  v_opening_cash numeric(18,2);
  v_cash_total numeric(18,2) := 0;
  v_refund_total numeric(18,2) := 0;
  v_reversal_total numeric(18,2) := 0;
  v_paid_in numeric(18,2) := 0;
  v_paid_out numeric(18,2) := 0;
  v_adjustment_in numeric(18,2) := 0;
  v_adjustment_out numeric(18,2) := 0;
begin
  select round(coalesce(s.opening_cash,0)::numeric,2)
  into v_opening_cash
  from public.pos_shifts s
  where s.id = p_session_id
    and s.organization_id = p_organization_id
    and s.entity_id = p_entity_id
    and lower(pg_catalog.btrim(coalesce(s.application_id,''))) = v_application_id;

  if v_opening_cash is null then
    raise exception 'POS cash session not found in selected scope';
  end if;

  select round(coalesce(sum(case
    when upper(pg_catalog.btrim(coalesce(payment_method,''))) = 'CASH' then amount
    else 0
  end),0)::numeric,2)
  into v_cash_total
  from public.payments
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and application_id = v_application_id
    and cash_session_id = p_session_id
    and upper(coalesce(status,'')) in ('PAID','COMPLETED');

  select
    round(coalesce(sum(case when upper(correction_type) = 'REFUND' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(correction_type) = 'REVERSAL' then amount else 0 end),0)::numeric,2)
  into v_refund_total, v_reversal_total
  from public.pos_payment_corrections
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and application_id = v_application_id
    and cash_session_id = p_session_id
    and upper(status) = 'POSTED';

  select
    round(coalesce(sum(case when upper(movement_type) = 'PAID_IN' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(movement_type) = 'PAID_OUT' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(movement_type) = 'ADJUSTMENT_IN' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(movement_type) = 'ADJUSTMENT_OUT' then amount else 0 end),0)::numeric,2)
  into v_paid_in, v_paid_out, v_adjustment_in, v_adjustment_out
  from public.pos_cash_movements
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and application_id = v_application_id
    and cash_session_id = p_session_id
    and upper(status) = 'POSTED';

  return round((
    v_opening_cash + v_cash_total + v_paid_in + v_adjustment_in
    - v_paid_out - v_adjustment_out - v_refund_total - v_reversal_total
  )::numeric,2);
end;
$$;

revoke all on function public.pos_expected_cash_live(uuid,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.pos_expected_cash_live(uuid,uuid,text,uuid)
  to service_role;

create or replace function public.operations_record_cash_transfer_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_transfer_type text,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_source_cash_session_id uuid,
  p_destination_cash_session_id uuid,
  p_amount numeric,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_app text := lower(pg_catalog.btrim(coalesce(p_application_id,'')));
  v_type text := upper(pg_catalog.btrim(coalesce(p_transfer_type,'')));
  v_amount numeric(18,2) := round(coalesce(p_amount,0)::numeric,2);
  v_role text;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
  v_currency text;
  v_drawer_account_id uuid;
  v_transfer_id uuid := gen_random_uuid();
  v_movement_id uuid;
  v_source_account_id uuid;
  v_destination_account_id uuid;
  v_live_expected_cash numeric(18,2);
  v_source_location public.operations_cash_locations%rowtype;
  v_destination_location public.operations_cash_locations%rowtype;
  v_source_shift public.pos_shifts%rowtype;
  v_destination_shift public.pos_shifts%rowtype;
  v_existing public.operations_cash_transfers%rowtype;
  v_transfer public.operations_cash_transfers%rowtype;
  v_source_document text;
  v_source_module text;
  v_source_document_id uuid;
  v_lines jsonb;
  v_posting jsonb;
  v_journal_id uuid;
  v_event jsonb;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organizationId and entityId required'; end if;
  if nullif(v_app,'') is null then raise exception 'applicationId required'; end if;
  if p_actor_id is null then raise exception 'Authenticated manager required'; end if;
  if v_amount <= 0 then raise exception 'Cash transfer amount must be greater than zero'; end if;
  if nullif(v_reason,'') is null then raise exception 'Cash transfer reason required'; end if;
  if nullif(v_key,'') is null then raise exception 'idempotencyKey required'; end if;
  if v_type not in ('DRAWER_TO_LOCATION','LOCATION_TO_DRAWER','LOCATION_TO_LOCATION') then
    raise exception 'Unsupported cash transfer type';
  end if;

  if v_type = 'DRAWER_TO_LOCATION' and not (
    p_source_cash_session_id is not null and p_destination_location_id is not null and
    p_source_location_id is null and p_destination_cash_session_id is null
  ) then raise exception 'DRAWER_TO_LOCATION requires source cash session and destination cash location'; end if;
  if v_type = 'LOCATION_TO_DRAWER' and not (
    p_source_location_id is not null and p_destination_cash_session_id is not null and
    p_source_cash_session_id is null and p_destination_location_id is null
  ) then raise exception 'LOCATION_TO_DRAWER requires source cash location and destination cash session'; end if;
  if v_type = 'LOCATION_TO_LOCATION' and not (
    p_source_location_id is not null and p_destination_location_id is not null and
    p_source_cash_session_id is null and p_destination_cash_session_id is null
  ) then raise exception 'LOCATION_TO_LOCATION requires source and destination cash locations'; end if;
  if p_source_location_id is not null and p_source_location_id = p_destination_location_id then
    raise exception 'Source and destination cash locations must differ';
  end if;

  select upper(pg_catalog.btrim(coalesce(ou.role,sa.role,p_actor_role,'')))
  into v_role
  from public.staff_accounts sa
  left join public.organization_users ou
    on ou.staff_account_id = sa.id
   and ou.organization_id = p_organization_id
   and lower(coalesce(ou.status,'active')) = 'active'
  where sa.id = p_actor_id
    and coalesce(sa.active,true) = true
    and (sa.active_organization_id = p_organization_id or ou.id is not null)
  order by ou.created_at desc nulls last
  limit 1;

  if coalesce(v_role,'') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then
    raise exception 'Manager or owner role required for cash transfers';
  end if;

  select * into v_existing
  from public.operations_cash_transfers t
  where t.organization_id = p_organization_id
    and t.entity_id = p_entity_id
    and t.idempotency_key = v_key
  limit 1;
  if found then
    return jsonb_build_object('success',true,'duplicate',true,'transfer',to_jsonb(v_existing),'event_id',null);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text||':'||p_entity_id::text||':'||v_app||':operations-cash-transfer',0)
  );

  select upper(e.currency) into v_currency
  from public.legal_entities e
  where e.id = p_entity_id
    and e.organization_id = p_organization_id
    and coalesce(e.is_active,true) = true;
  if v_currency is null then raise exception 'Legal entity currency is unavailable'; end if;

  v_drawer_account_id := public.operations_resolve_pos_cash_account(p_organization_id,p_entity_id);

  if p_source_location_id is not null then
    select * into v_source_location
    from public.operations_cash_locations l
    where l.id = p_source_location_id
      and l.organization_id = p_organization_id
      and l.entity_id = p_entity_id
      and l.is_active = true
    for update;
    if not found then raise exception 'Source cash location is unavailable'; end if;
    if upper(v_source_location.currency_code) <> v_currency then raise exception 'Source cash location currency mismatch'; end if;
    if round(coalesce(v_source_location.current_balance,0)::numeric,2) + 0.005 < v_amount then
      raise exception 'Source cash location has insufficient available balance';
    end if;
    v_source_account_id := v_source_location.finance_account_id;
  else
    select * into v_source_shift
    from public.pos_shifts s
    where s.id = p_source_cash_session_id
      and s.organization_id = p_organization_id
      and s.entity_id = p_entity_id
      and lower(pg_catalog.btrim(coalesce(s.application_id,''))) = v_app
      and upper(coalesce(s.status,'')) in ('OPEN','ACTIVE')
      and coalesce(s.locked,false) = false
    for update;
    if not found then raise exception 'Source POS cash session is not active'; end if;
    v_live_expected_cash := public.pos_expected_cash_live(
      p_organization_id,p_entity_id,v_app,p_source_cash_session_id
    );
    if v_live_expected_cash + 0.005 < v_amount then
      raise exception 'Active cash session does not have enough expected cash for this transfer';
    end if;
    v_source_account_id := v_drawer_account_id;
  end if;

  if p_destination_location_id is not null then
    select * into v_destination_location
    from public.operations_cash_locations l
    where l.id = p_destination_location_id
      and l.organization_id = p_organization_id
      and l.entity_id = p_entity_id
      and l.is_active = true
    for update;
    if not found then raise exception 'Destination cash location is unavailable'; end if;
    if upper(v_destination_location.currency_code) <> v_currency then raise exception 'Destination cash location currency mismatch'; end if;
    v_destination_account_id := v_destination_location.finance_account_id;
  else
    select * into v_destination_shift
    from public.pos_shifts s
    where s.id = p_destination_cash_session_id
      and s.organization_id = p_organization_id
      and s.entity_id = p_entity_id
      and lower(pg_catalog.btrim(coalesce(s.application_id,''))) = v_app
      and upper(coalesce(s.status,'')) in ('OPEN','ACTIVE')
      and coalesce(s.locked,false) = false
    for update;
    if not found then raise exception 'Destination POS cash session is not active'; end if;
    v_destination_account_id := v_drawer_account_id;
  end if;

  if v_source_account_id = v_destination_account_id then
    raise exception 'Source and destination must use separate Finance cash accounts';
  end if;

  perform 1 from public.chart_of_accounts a
  where a.id = v_source_account_id
    and a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and coalesce(a.is_active,true) = true;
  if not found then raise exception 'Source Finance account is outside the selected scope or inactive'; end if;

  perform 1 from public.chart_of_accounts a
  where a.id = v_destination_account_id
    and a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and coalesce(a.is_active,true) = true;
  if not found then raise exception 'Destination Finance account is outside the selected scope or inactive'; end if;

  if v_type in ('DRAWER_TO_LOCATION','LOCATION_TO_DRAWER') then
    v_movement_id := gen_random_uuid();
    v_source_document := case when v_type='DRAWER_TO_LOCATION' then 'POS_CASH_PAID_OUT' else 'POS_CASH_PAID_IN' end;
    v_source_module := 'pos';
    v_source_document_id := v_movement_id;
  else
    v_source_document := 'OPERATIONS_CASH_LOCATION_TRANSFER';
    v_source_module := 'operations';
    v_source_document_id := v_transfer_id;
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id',v_destination_account_id,'debit',v_amount,'credit',0,'description',v_reason),
    jsonb_build_object('account_id',v_source_account_id,'debit',0,'credit',v_amount,'description',v_reason)
  );

  select public.finance_post_journal_atomic(
    p_organization_id=>p_organization_id,
    p_entity_id=>p_entity_id,
    p_posting_date=>current_date,
    p_document_date=>current_date,
    p_journal_type=>'SYSTEM',
    p_reference=>'operations-cash-transfer:'||v_transfer_id::text,
    p_source_module=>v_source_module,
    p_source_document=>v_source_document,
    p_source_document_id=>v_source_document_id,
    p_description=>v_reason,
    p_currency_code=>v_currency,
    p_exchange_rate=>1,
    p_lines=>v_lines,
    p_created_by=>p_actor_id,
    p_idempotency_key=>'operations-cash-transfer:'||v_transfer_id::text
  ) into v_posting;

  v_journal_id := nullif(v_posting->'journal'->>'id','')::uuid;
  if v_journal_id is null then raise exception 'Cash transfer Finance posting did not return a journal entry'; end if;

  insert into public.operations_cash_transfers(
    id,organization_id,entity_id,application_id,transfer_type,
    source_location_id,destination_location_id,source_cash_session_id,destination_cash_session_id,
    amount,currency_code,source_account_id,destination_account_id,journal_entry_id,drawer_movement_id,
    reason,status,created_by,idempotency_key,metadata
  ) values(
    v_transfer_id,p_organization_id,p_entity_id,v_app,v_type,
    p_source_location_id,p_destination_location_id,p_source_cash_session_id,p_destination_cash_session_id,
    v_amount,v_currency,v_source_account_id,v_destination_account_id,v_journal_id,v_movement_id,
    v_reason,'POSTED',p_actor_id,v_key,jsonb_build_object('actor_role',v_role)
  ) returning * into v_transfer;

  if p_source_location_id is not null then
    update public.operations_cash_locations
    set current_balance=round((current_balance-v_amount)::numeric,2),updated_at=now()
    where id=p_source_location_id;
  end if;
  if p_destination_location_id is not null then
    update public.operations_cash_locations
    set current_balance=round((current_balance+v_amount)::numeric,2),updated_at=now()
    where id=p_destination_location_id;
  end if;

  if v_movement_id is not null then
    insert into public.pos_cash_movements(
      id,organization_id,entity_id,application_id,cash_session_id,movement_type,amount,currency_code,
      cash_account_id,counter_account_id,journal_entry_id,cash_transfer_id,reason,status,created_by,
      idempotency_key,metadata
    ) values(
      v_movement_id,p_organization_id,p_entity_id,v_app,
      coalesce(p_source_cash_session_id,p_destination_cash_session_id),
      case when v_type='DRAWER_TO_LOCATION' then 'PAID_OUT' else 'PAID_IN' end,
      v_amount,v_currency,v_drawer_account_id,
      case when v_type='DRAWER_TO_LOCATION' then v_destination_account_id else v_source_account_id end,
      v_journal_id,v_transfer_id,v_reason,'POSTED',p_actor_id,
      'operations-cash-transfer:'||v_transfer_id::text||':drawer-projection',
      jsonb_build_object('cash_transfer_id',v_transfer_id,'transfer_type',v_type)
    );

    if v_type='DRAWER_TO_LOCATION' then
      v_live_expected_cash := public.pos_expected_cash_live(
        p_organization_id,p_entity_id,v_app,p_source_cash_session_id
      );
      update public.pos_shifts
      set paid_out_total=round((coalesce(paid_out_total,0)+v_amount)::numeric,2),
          expected_cash=v_live_expected_cash,
          updated_at=now()
      where id=p_source_cash_session_id;
    else
      v_live_expected_cash := public.pos_expected_cash_live(
        p_organization_id,p_entity_id,v_app,p_destination_cash_session_id
      );
      update public.pos_shifts
      set paid_in_total=round((coalesce(paid_in_total,0)+v_amount)::numeric,2),
          expected_cash=v_live_expected_cash,
          updated_at=now()
      where id=p_destination_cash_session_id;
    end if;
  end if;

  v_event := public.record_system_event_atomic(
    p_organization_id,
    'OPERATIONS_CASH_TRANSFER_POSTED',
    jsonb_build_object(
      'organization_id',p_organization_id,
      'entity_id',p_entity_id,
      'application_id',v_app,
      'transfer_id',v_transfer_id,
      'transfer_type',v_type,
      'amount',v_amount,
      'currency_code',v_currency,
      'source_location_id',p_source_location_id,
      'destination_location_id',p_destination_location_id,
      'source_cash_session_id',p_source_cash_session_id,
      'destination_cash_session_id',p_destination_cash_session_id,
      'source_account_id',v_source_account_id,
      'destination_account_id',v_destination_account_id,
      'journal_entry_id',v_journal_id,
      'drawer_movement_id',v_movement_id,
      'reason',v_reason,
      'actor_id',p_actor_id
    ),
    'operations-cash-transfer:'||v_transfer_id::text
  );

  return jsonb_build_object(
    'success',true,
    'duplicate',false,
    'transfer',to_jsonb(v_transfer),
    'journal_entry_id',v_journal_id,
    'drawer_movement_id',v_movement_id,
    'event_id',v_event->'event'->>'id'
  );
end;
$$;

revoke all on function public.operations_record_cash_transfer_atomic(uuid,uuid,text,text,uuid,uuid,uuid,uuid,numeric,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.operations_record_cash_transfer_atomic(uuid,uuid,text,text,uuid,uuid,uuid,uuid,numeric,uuid,text,text,text)
  to service_role;
