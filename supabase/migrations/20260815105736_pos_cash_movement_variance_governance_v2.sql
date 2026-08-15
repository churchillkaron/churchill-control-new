begin;

-- Generic platform migration only.
-- Organization/legal-entity Finance configuration is intentionally not seeded here.
-- Each legal entity must configure its cash account through POS_CASH_PAYMENT_RECEIVED
-- and its POS_CASH_OVER / POS_CASH_SHORT posting mappings through Finance configuration.

alter table public.pos_shifts
  add column if not exists paid_in_total numeric(18,2) not null default 0,
  add column if not exists paid_out_total numeric(18,2) not null default 0,
  add column if not exists adjustment_in_total numeric(18,2) not null default 0,
  add column if not exists adjustment_out_total numeric(18,2) not null default 0,
  add column if not exists variance_journal_entry_id uuid references public.journal_entries(id),
  add column if not exists variance_posted_at timestamptz;

create table if not exists public.pos_cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  application_id text not null,
  cash_session_id uuid not null references public.pos_shifts(id),
  movement_type text not null,
  amount numeric(18,2) not null,
  currency_code text not null,
  cash_account_id uuid not null references public.chart_of_accounts(id),
  counter_account_id uuid not null references public.chart_of_accounts(id),
  journal_entry_id uuid not null references public.journal_entries(id),
  reason text not null,
  status text not null default 'POSTED',
  created_by uuid not null references public.staff_accounts(id),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pos_cash_movements_type_check
    check (upper(movement_type) in ('PAID_IN','PAID_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT')),
  constraint pos_cash_movements_amount_check check (amount > 0),
  constraint pos_cash_movements_status_check check (upper(status) = 'POSTED'),
  constraint pos_cash_movements_accounts_differ check (cash_account_id <> counter_account_id)
);

create unique index if not exists pos_cash_movements_idempotency_uidx
  on public.pos_cash_movements (organization_id, entity_id, idempotency_key);

create index if not exists pos_cash_movements_session_created_idx
  on public.pos_cash_movements (
    organization_id,
    entity_id,
    application_id,
    cash_session_id,
    created_at desc
  );

alter table public.pos_cash_movements enable row level security;
revoke all on table public.pos_cash_movements from public, anon, authenticated;
grant all on table public.pos_cash_movements to service_role;

create or replace function public.finance_post_pos_cash_movement_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_movement_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_counter_account_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_type text := upper(pg_catalog.btrim(coalesce(p_movement_type, '')));
  v_amount numeric(18,2) := round(coalesce(p_amount,0)::numeric,2);
  v_cash_account_id uuid;
  v_currency text;
  v_counter public.chart_of_accounts%rowtype;
  v_lines jsonb;
  v_posting jsonb;
  v_journal_id uuid;
  v_source_document text;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_movement_id is null then raise exception 'movement_id required'; end if;
  if v_type not in ('PAID_IN','PAID_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT') then raise exception 'Unsupported POS cash movement type'; end if;
  if v_amount <= 0 then raise exception 'Cash movement amount must be greater than zero'; end if;
  if p_counter_account_id is null then raise exception 'counter_account_id required'; end if;
  if p_actor_id is null then raise exception 'actor_id required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_reason,'')),'') is null then raise exception 'Cash movement reason required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'idempotency_key required'; end if;

  select m.debit_account_id into v_cash_account_id
  from public.finance_posting_mappings m
  where m.organization_id=p_organization_id
    and (m.entity_id=p_entity_id or m.entity_id is null)
    and m.event_type='POS_CASH_PAYMENT_RECEIVED'
    and upper(coalesce(m.status,''))='ACTIVE'
  order by case when m.entity_id=p_entity_id then 0 else 1 end, m.priority, m.created_at
  limit 1;
  if v_cash_account_id is null then raise exception 'Finance cash account is not configured for this legal entity'; end if;

  perform 1 from public.chart_of_accounts a
  where a.id=v_cash_account_id and a.organization_id=p_organization_id and a.entity_id=p_entity_id and coalesce(a.is_active,true)=true;
  if not found then raise exception 'Configured Finance cash account is outside the selected scope or inactive'; end if;

  select * into v_counter from public.chart_of_accounts a
  where a.id=p_counter_account_id and a.organization_id=p_organization_id and a.entity_id=p_entity_id and coalesce(a.is_active,true)=true;
  if not found then raise exception 'Counter account is outside the selected scope or inactive'; end if;
  if v_counter.id=v_cash_account_id then raise exception 'Counter account must differ from the cash account'; end if;

  select upper(e.currency) into v_currency from public.legal_entities e
  where e.id=p_entity_id and e.organization_id=p_organization_id and coalesce(e.is_active,true)=true;
  if v_currency is null then raise exception 'Legal entity currency is unavailable'; end if;

  if v_type in ('PAID_IN','ADJUSTMENT_IN') then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',v_cash_account_id,'debit',v_amount,'credit',0,'description',pg_catalog.btrim(p_reason)),
      jsonb_build_object('account_id',v_counter.id,'debit',0,'credit',v_amount,'description',pg_catalog.btrim(p_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',v_counter.id,'debit',v_amount,'credit',0,'description',pg_catalog.btrim(p_reason)),
      jsonb_build_object('account_id',v_cash_account_id,'debit',0,'credit',v_amount,'description',pg_catalog.btrim(p_reason))
    );
  end if;

  v_source_document := 'POS_CASH_' || v_type;
  select public.finance_post_journal_atomic(
    p_organization_id=>p_organization_id,
    p_entity_id=>p_entity_id,
    p_posting_date=>current_date,
    p_document_date=>current_date,
    p_journal_type=>'SYSTEM',
    p_reference=>'pos-cash-movement:'||p_movement_id::text,
    p_source_module=>'pos',
    p_source_document=>v_source_document,
    p_source_document_id=>p_movement_id,
    p_description=>pg_catalog.btrim(p_reason),
    p_currency_code=>v_currency,
    p_exchange_rate=>1,
    p_lines=>v_lines,
    p_created_by=>p_actor_id,
    p_idempotency_key=>pg_catalog.btrim(p_idempotency_key)
  ) into v_posting;

  v_journal_id := nullif(v_posting->'journal'->>'id','')::uuid;
  if v_journal_id is null then raise exception 'POS cash movement posting did not return a journal entry'; end if;

  return jsonb_build_object(
    'success',true,
    'journal_entry_id',v_journal_id,
    'cash_account_id',v_cash_account_id,
    'counter_account_id',v_counter.id,
    'currency_code',v_currency,
    'source_document',v_source_document
  );
end;
$$;

revoke all on function public.finance_post_pos_cash_movement_atomic(uuid,uuid,uuid,text,numeric,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.finance_post_pos_cash_movement_atomic(uuid,uuid,uuid,text,numeric,uuid,uuid,text,text)
  to service_role;

create or replace function public.pos_record_cash_movement_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_cash_session_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_counter_account_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_app text := lower(pg_catalog.btrim(coalesce(p_application_id,'')));
  v_type text := upper(pg_catalog.btrim(coalesce(p_movement_type,'')));
  v_amount numeric(18,2) := round(coalesce(p_amount,0)::numeric,2);
  v_role text;
  v_shift public.pos_shifts%rowtype;
  v_existing public.pos_cash_movements%rowtype;
  v_movement_id uuid := gen_random_uuid();
  v_finance jsonb;
  v_journal_id uuid;
  v_cash_account_id uuid;
  v_currency text;
  v_cash_total numeric(18,2):=0;
  v_card_total numeric(18,2):=0;
  v_qr_total numeric(18,2):=0;
  v_transfer_total numeric(18,2):=0;
  v_gross_total numeric(18,2):=0;
  v_refund_total numeric(18,2):=0;
  v_reversal_total numeric(18,2):=0;
  v_paid_in numeric(18,2):=0;
  v_paid_out numeric(18,2):=0;
  v_adjustment_in numeric(18,2):=0;
  v_adjustment_out numeric(18,2):=0;
  v_current_expected numeric(18,2):=0;
  v_expected numeric(18,2):=0;
  v_event jsonb;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organizationId and entityId required'; end if;
  if nullif(v_app,'') is null then raise exception 'applicationId required'; end if;
  if p_cash_session_id is null then raise exception 'cashSessionId required'; end if;
  if v_type not in ('PAID_IN','PAID_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT') then raise exception 'Unsupported cash movement type'; end if;
  if v_amount<=0 then raise exception 'Cash movement amount must be greater than zero'; end if;
  if p_counter_account_id is null then raise exception 'counterAccountId required'; end if;
  if p_actor_id is null then raise exception 'Authenticated manager required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_reason,'')),'') is null then raise exception 'Cash movement reason required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'idempotencyKey required'; end if;

  select upper(pg_catalog.btrim(coalesce(ou.role,sa.role,p_actor_role,''))) into v_role
  from public.staff_accounts sa
  left join public.organization_users ou
    on ou.staff_account_id=sa.id
   and ou.organization_id=p_organization_id
   and lower(coalesce(ou.status,'active'))='active'
  where sa.id=p_actor_id
    and coalesce(sa.active,true)=true
    and (sa.active_organization_id=p_organization_id or ou.id is not null)
  order by ou.created_at desc nulls last
  limit 1;

  if coalesce(v_role,'') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then
    raise exception 'Manager or owner role required for POS cash movements';
  end if;

  select * into v_existing from public.pos_cash_movements
  where organization_id=p_organization_id
    and entity_id=p_entity_id
    and idempotency_key=pg_catalog.btrim(p_idempotency_key)
  limit 1;

  if found then
    if v_existing.cash_session_id<>p_cash_session_id
       or upper(v_existing.movement_type)<>v_type
       or round(v_existing.amount::numeric,2)<>v_amount then
      raise exception 'Idempotency key is already used by a different POS cash movement';
    end if;
    return jsonb_build_object(
      'success',true,
      'duplicate',true,
      'movement',to_jsonb(v_existing),
      'session',(select to_jsonb(s) from public.pos_shifts s where s.id=v_existing.cash_session_id)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text||':'||p_entity_id::text||':'||v_app||':pos-cash-session',
      0
    )
  );

  select * into v_shift from public.pos_shifts
  where id=p_cash_session_id
    and organization_id=p_organization_id
    and entity_id=p_entity_id
    and lower(pg_catalog.btrim(coalesce(application_id,'')))=v_app
    and upper(coalesce(status,'')) in ('OPEN','ACTIVE')
    and coalesce(locked,false)=false
  for update;

  if not found then raise exception 'POS cash session is not active in the selected scope'; end if;

  select
    round(coalesce(sum(case when upper(trim(coalesce(payment_method,'')))='CASH' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(trim(coalesce(payment_method,''))) in ('CARD','CREDIT_CARD') then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(trim(coalesce(payment_method,''))) in ('QR','QR_PAYMENT') then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(trim(coalesce(payment_method,''))) in ('TRANSFER','BANK_TRANSFER') then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(amount),0)::numeric,2)
  into v_cash_total,v_card_total,v_qr_total,v_transfer_total,v_gross_total
  from public.payments
  where organization_id=p_organization_id
    and entity_id=p_entity_id
    and lower(trim(coalesce(application_id,'')))=v_app
    and cash_session_id=p_cash_session_id
    and upper(coalesce(status,'')) in ('PAID','COMPLETED');

  select
    round(coalesce(sum(case when upper(correction_type)='REFUND' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(correction_type)='REVERSAL' then amount else 0 end),0)::numeric,2)
  into v_refund_total,v_reversal_total
  from public.pos_payment_corrections
  where organization_id=p_organization_id
    and entity_id=p_entity_id
    and application_id=v_app
    and cash_session_id=p_cash_session_id
    and upper(status)='POSTED';

  select
    round(coalesce(sum(case when upper(movement_type)='PAID_IN' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(movement_type)='PAID_OUT' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(movement_type)='ADJUSTMENT_IN' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(movement_type)='ADJUSTMENT_OUT' then amount else 0 end),0)::numeric,2)
  into v_paid_in,v_paid_out,v_adjustment_in,v_adjustment_out
  from public.pos_cash_movements
  where organization_id=p_organization_id
    and entity_id=p_entity_id
    and application_id=v_app
    and cash_session_id=p_cash_session_id
    and upper(status)='POSTED';

  v_current_expected:=round((
    coalesce(v_shift.opening_cash,0)
    +v_cash_total
    +v_paid_in
    +v_adjustment_in
    -v_paid_out
    -v_adjustment_out
    -v_refund_total
    -v_reversal_total
  )::numeric,2);

  if v_type in ('PAID_OUT','ADJUSTMENT_OUT') and v_current_expected+0.005<v_amount then
    raise exception 'Active cash session does not have enough expected cash for this movement';
  end if;

  v_finance:=public.finance_post_pos_cash_movement_atomic(
    p_organization_id,
    p_entity_id,
    v_movement_id,
    v_type,
    v_amount,
    p_counter_account_id,
    p_actor_id,
    pg_catalog.btrim(p_reason),
    'pos-cash-movement:'||v_movement_id::text
  );

  v_journal_id:=nullif(v_finance->>'journal_entry_id','')::uuid;
  v_cash_account_id:=nullif(v_finance->>'cash_account_id','')::uuid;
  v_currency:=nullif(v_finance->>'currency_code','');

  if v_journal_id is null or v_cash_account_id is null or v_currency is null then
    raise exception 'POS cash movement Finance posting is incomplete';
  end if;

  insert into public.pos_cash_movements(
    id,
    organization_id,
    entity_id,
    application_id,
    cash_session_id,
    movement_type,
    amount,
    currency_code,
    cash_account_id,
    counter_account_id,
    journal_entry_id,
    reason,
    status,
    created_by,
    idempotency_key,
    metadata
  ) values(
    v_movement_id,
    p_organization_id,
    p_entity_id,
    v_app,
    p_cash_session_id,
    v_type,
    v_amount,
    v_currency,
    v_cash_account_id,
    p_counter_account_id,
    v_journal_id,
    pg_catalog.btrim(p_reason),
    'POSTED',
    p_actor_id,
    pg_catalog.btrim(p_idempotency_key),
    jsonb_build_object('actor_role',v_role)
  ) returning * into v_existing;

  if v_type='PAID_IN' then v_paid_in:=v_paid_in+v_amount;
  elsif v_type='PAID_OUT' then v_paid_out:=v_paid_out+v_amount;
  elsif v_type='ADJUSTMENT_IN' then v_adjustment_in:=v_adjustment_in+v_amount;
  else v_adjustment_out:=v_adjustment_out+v_amount;
  end if;

  v_expected:=round((
    coalesce(v_shift.opening_cash,0)
    +v_cash_total
    +v_paid_in
    +v_adjustment_in
    -v_paid_out
    -v_adjustment_out
    -v_refund_total
    -v_reversal_total
  )::numeric,2);

  update public.pos_shifts
  set cash_total=v_cash_total,
      card_total=v_card_total,
      qr_total=v_qr_total,
      transfer_total=v_transfer_total,
      refund_total=v_refund_total,
      reversal_total=v_reversal_total,
      paid_in_total=v_paid_in,
      paid_out_total=v_paid_out,
      adjustment_in_total=v_adjustment_in,
      adjustment_out_total=v_adjustment_out,
      net_sales=round((v_gross_total-v_refund_total-v_reversal_total)::numeric,2),
      expected_cash=v_expected,
      updated_at=now()
  where id=p_cash_session_id
  returning * into v_shift;

  v_event:=public.record_system_event_atomic(
    p_organization_id,
    'POS_CASH_'||v_type,
    jsonb_build_object(
      'organization_id',p_organization_id,
      'entity_id',p_entity_id,
      'application_id',v_app,
      'cash_session_id',p_cash_session_id,
      'movement_id',v_movement_id,
      'movement_type',v_type,
      'amount',v_amount,
      'currency_code',v_currency,
      'cash_account_id',v_cash_account_id,
      'counter_account_id',p_counter_account_id,
      'journal_entry_id',v_journal_id,
      'reason',pg_catalog.btrim(p_reason),
      'actor_id',p_actor_id
    ),
    'pos-cash-movement:'||v_movement_id::text
  );

  return jsonb_build_object(
    'success',true,
    'duplicate',false,
    'movement',to_jsonb(v_existing),
    'session',to_jsonb(v_shift),
    'event_id',v_event->'event'->>'id'
  );
end;
$$;

revoke all on function public.pos_record_cash_movement_atomic(uuid,uuid,text,uuid,text,numeric,uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.pos_record_cash_movement_atomic(uuid,uuid,text,uuid,text,numeric,uuid,uuid,text,text,text)
  to service_role;

create or replace function public.finance_post_pos_cash_variance_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_cash_session_id uuid,
  p_variance numeric,
  p_actor_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_variance numeric(18,2):=round(coalesce(p_variance,0)::numeric,2);
  v_amount numeric(18,2);
  v_event_type text;
  v_mapping public.finance_posting_mappings%rowtype;
  v_currency text;
  v_lines jsonb;
  v_posting jsonb;
  v_journal_id uuid;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_cash_session_id is null or p_actor_id is null then raise exception 'cash_session_id and actor_id required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'idempotency_key required'; end if;

  if abs(v_variance)<=0.01 then
    return jsonb_build_object('success',true,'journal_entry_id',null,'event_type',null,'amount',0);
  end if;

  v_amount:=abs(v_variance);
  v_event_type:=case when v_variance>0 then 'POS_CASH_OVER' else 'POS_CASH_SHORT' end;

  select * into v_mapping from public.finance_posting_mappings m
  where m.organization_id=p_organization_id
    and (m.entity_id=p_entity_id or m.entity_id is null)
    and m.event_type=v_event_type
    and upper(coalesce(m.status,''))='ACTIVE'
    and coalesce(m.auto_post,true)=true
  order by case when m.entity_id=p_entity_id then 0 else 1 end,m.priority,m.created_at
  limit 1;

  if not found then raise exception 'Finance posting mapping % is not configured for this legal entity',v_event_type; end if;

  perform 1 from public.chart_of_accounts a
  where a.id=v_mapping.debit_account_id
    and a.organization_id=p_organization_id
    and a.entity_id=p_entity_id
    and coalesce(a.is_active,true)=true;
  if not found then raise exception 'Cash variance debit account is outside the selected scope or inactive'; end if;

  perform 1 from public.chart_of_accounts a
  where a.id=v_mapping.credit_account_id
    and a.organization_id=p_organization_id
    and a.entity_id=p_entity_id
    and coalesce(a.is_active,true)=true;
  if not found then raise exception 'Cash variance credit account is outside the selected scope or inactive'; end if;

  select upper(e.currency) into v_currency
  from public.legal_entities e
  where e.id=p_entity_id
    and e.organization_id=p_organization_id
    and coalesce(e.is_active,true)=true;
  if v_currency is null then raise exception 'Legal entity currency is unavailable'; end if;

  v_lines:=jsonb_build_array(
    jsonb_build_object(
      'account_id',v_mapping.debit_account_id,
      'debit',v_amount,
      'credit',0,
      'description',coalesce(nullif(pg_catalog.btrim(coalesce(p_reason,'')),''),v_event_type)
    ),
    jsonb_build_object(
      'account_id',v_mapping.credit_account_id,
      'debit',0,
      'credit',v_amount,
      'description',coalesce(nullif(pg_catalog.btrim(coalesce(p_reason,'')),''),v_event_type)
    )
  );

  select public.finance_post_journal_atomic(
    p_organization_id=>p_organization_id,
    p_entity_id=>p_entity_id,
    p_posting_date=>current_date,
    p_document_date=>current_date,
    p_journal_type=>'SYSTEM',
    p_reference=>'pos-cash-variance:'||p_cash_session_id::text,
    p_source_module=>'pos',
    p_source_document=>v_event_type,
    p_source_document_id=>p_cash_session_id,
    p_description=>coalesce(nullif(pg_catalog.btrim(coalesce(p_reason,'')),''),v_event_type),
    p_currency_code=>v_currency,
    p_exchange_rate=>1,
    p_lines=>v_lines,
    p_created_by=>p_actor_id,
    p_idempotency_key=>pg_catalog.btrim(p_idempotency_key)
  ) into v_posting;

  v_journal_id:=nullif(v_posting->'journal'->>'id','')::uuid;
  if v_journal_id is null then raise exception 'POS cash variance posting did not return a journal entry'; end if;

  return jsonb_build_object(
    'success',true,
    'journal_entry_id',v_journal_id,
    'event_type',v_event_type,
    'amount',v_amount,
    'debit_account_id',v_mapping.debit_account_id,
    'credit_account_id',v_mapping.credit_account_id
  );
end;
$$;

revoke all on function public.finance_post_pos_cash_variance_atomic(uuid,uuid,uuid,numeric,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.finance_post_pos_cash_variance_atomic(uuid,uuid,uuid,numeric,uuid,text,text)
  to service_role;

create or replace function public.guard_pos_shift_reconciliation_immutability()
returns trigger
language plpgsql
set search_path to public
as $$
begin
  if coalesce(old.locked,false)=true
     and upper(coalesce(old.status,''))='CLOSED'
     and (
       to_jsonb(new)-array[
         'approval_status','approved_by','approved_at',
         'accounting_status','accounting_confirmed_by','accounting_confirmed_at',
         'accounting_notes','period_closed','variance_journal_entry_id','variance_posted_at','updated_at'
       ]::text[]
     ) is distinct from (
       to_jsonb(old)-array[
         'approval_status','approved_by','approved_at',
         'accounting_status','accounting_confirmed_by','accounting_confirmed_at',
         'accounting_notes','period_closed','variance_journal_entry_id','variance_posted_at','updated_at'
       ]::text[]
     ) then
    raise exception 'Reconciled POS cash-session financial snapshot is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.pos_close_cash_session_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_session_id uuid,
  p_closing_cash numeric,
  p_closed_by uuid,
  p_closed_by_name text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application_id text:=lower(trim(coalesce(p_application_id,'')));
  v_closing_cash numeric(18,2):=round(coalesce(p_closing_cash,0)::numeric,2);
  v_cash_total numeric(18,2):=0;
  v_card_total numeric(18,2):=0;
  v_qr_total numeric(18,2):=0;
  v_transfer_total numeric(18,2):=0;
  v_gross_total numeric(18,2):=0;
  v_refund_total numeric(18,2):=0;
  v_reversal_total numeric(18,2):=0;
  v_paid_in numeric(18,2):=0;
  v_paid_out numeric(18,2):=0;
  v_adjustment_in numeric(18,2):=0;
  v_adjustment_out numeric(18,2):=0;
  v_net_sales numeric(18,2):=0;
  v_expected_cash numeric(18,2):=0;
  v_variance numeric(18,2):=0;
  v_shift public.pos_shifts%rowtype;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organizationId and entityId required'; end if;
  if nullif(v_application_id,'') is null or p_session_id is null then raise exception 'applicationId and sessionId required'; end if;
  if p_closed_by is null then raise exception 'Authenticated operator required'; end if;
  if v_closing_cash<0 then raise exception 'Closing cash cannot be negative'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text||':'||p_entity_id::text||':'||v_application_id||':pos-cash-session',
      0
    )
  );

  select * into v_shift from public.pos_shifts
  where id=p_session_id
    and organization_id=p_organization_id
    and entity_id=p_entity_id
    and application_id=v_application_id
  for update;

  if not found then raise exception 'POS cash session not found in selected scope'; end if;
  if upper(coalesce(v_shift.status,''))='CLOSED' then
    return jsonb_build_object('success',true,'duplicate',true,'session',to_jsonb(v_shift));
  end if;
  if upper(coalesce(v_shift.status,'')) not in ('OPEN','ACTIVE') or coalesce(v_shift.locked,false) then
    raise exception 'POS cash session is not active';
  end if;

  select
    round(coalesce(sum(case when upper(trim(coalesce(payment_method,'')))='CASH' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(trim(coalesce(payment_method,''))) in ('CARD','CREDIT_CARD') then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(trim(coalesce(payment_method,''))) in ('QR','QR_PAYMENT') then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(trim(coalesce(payment_method,''))) in ('TRANSFER','BANK_TRANSFER') then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(amount),0)::numeric,2)
  into v_cash_total,v_card_total,v_qr_total,v_transfer_total,v_gross_total
  from public.payments
  where organization_id=p_organization_id
    and entity_id=p_entity_id
    and application_id=v_application_id
    and cash_session_id=p_session_id
    and upper(coalesce(status,'')) in ('PAID','COMPLETED');

  select
    round(coalesce(sum(case when upper(correction_type)='REFUND' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(correction_type)='REVERSAL' then amount else 0 end),0)::numeric,2)
  into v_refund_total,v_reversal_total
  from public.pos_payment_corrections
  where organization_id=p_organization_id
    and entity_id=p_entity_id
    and application_id=v_application_id
    and cash_session_id=p_session_id
    and upper(status)='POSTED';

  select
    round(coalesce(sum(case when upper(movement_type)='PAID_IN' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(movement_type)='PAID_OUT' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(movement_type)='ADJUSTMENT_IN' then amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(movement_type)='ADJUSTMENT_OUT' then amount else 0 end),0)::numeric,2)
  into v_paid_in,v_paid_out,v_adjustment_in,v_adjustment_out
  from public.pos_cash_movements
  where organization_id=p_organization_id
    and entity_id=p_entity_id
    and application_id=v_application_id
    and cash_session_id=p_session_id
    and upper(status)='POSTED';

  v_net_sales:=round((v_gross_total-v_refund_total-v_reversal_total)::numeric,2);
  v_expected_cash:=round((
    coalesce(v_shift.opening_cash,0)
    +v_cash_total
    +v_paid_in
    +v_adjustment_in
    -v_paid_out
    -v_adjustment_out
    -v_refund_total
    -v_reversal_total
  )::numeric,2);
  v_variance:=round((v_closing_cash-v_expected_cash)::numeric,2);

  update public.pos_shifts
  set cash_total=v_cash_total,
      card_total=v_card_total,
      qr_total=v_qr_total,
      transfer_total=v_transfer_total,
      refund_total=v_refund_total,
      reversal_total=v_reversal_total,
      paid_in_total=v_paid_in,
      paid_out_total=v_paid_out,
      adjustment_in_total=v_adjustment_in,
      adjustment_out_total=v_adjustment_out,
      net_sales=v_net_sales,
      expected_cash=v_expected_cash,
      closing_cash=v_closing_cash,
      variance=v_variance,
      status='CLOSED',
      closed_at=now(),
      reconciled_at=now(),
      closed_by=p_closed_by,
      closed_by_name=nullif(trim(coalesce(p_closed_by_name,'')),''),
      reconciliation_notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),reconciliation_notes),
      locked=true,
      updated_at=now()
  where id=p_session_id
  returning * into v_shift;

  return jsonb_build_object(
    'success',true,
    'duplicate',false,
    'session',to_jsonb(v_shift),
    'reconciliation',jsonb_build_object(
      'opening_cash',coalesce(v_shift.opening_cash,0),
      'cash_total',v_cash_total,
      'card_total',v_card_total,
      'qr_total',v_qr_total,
      'transfer_total',v_transfer_total,
      'refund_total',v_refund_total,
      'reversal_total',v_reversal_total,
      'paid_in_total',v_paid_in,
      'paid_out_total',v_paid_out,
      'adjustment_in_total',v_adjustment_in,
      'adjustment_out_total',v_adjustment_out,
      'net_sales',v_net_sales,
      'expected_cash',v_expected_cash,
      'closing_cash',v_closing_cash,
      'variance',v_variance
    )
  );
end;
$$;

revoke all on function public.pos_close_cash_session_atomic(uuid,uuid,text,uuid,numeric,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.pos_close_cash_session_atomic(uuid,uuid,text,uuid,numeric,uuid,text,text)
  to service_role;

commit;
