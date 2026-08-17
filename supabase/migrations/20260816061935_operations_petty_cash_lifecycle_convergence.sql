create table if not exists public.operations_petty_cash_funds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  cash_location_id uuid not null references public.operations_cash_locations(id),
  advance_account_id uuid not null references public.chart_of_accounts(id),
  replenish_source_location_id uuid not null references public.operations_cash_locations(id),
  currency_code text not null,
  target_balance numeric(18,2),
  is_active boolean not null default true,
  created_by uuid references public.staff_accounts(id),
  updated_by uuid references public.staff_accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_petty_cash_funds_target_check check (target_balance is null or target_balance >= 0),
  constraint operations_petty_cash_funds_locations_check check (cash_location_id <> replenish_source_location_id),
  unique (organization_id, entity_id, cash_location_id)
);

create table if not exists public.operations_petty_cash_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  fund_id uuid not null references public.operations_petty_cash_funds(id),
  source_application_id text,
  requester_staff_id uuid not null references public.staff_accounts(id),
  purpose text not null,
  requested_amount numeric(18,2) not null,
  approved_amount numeric(18,2),
  currency_code text not null,
  status text not null default 'PENDING',
  requested_at timestamptz not null default now(),
  approved_by uuid references public.staff_accounts(id),
  approved_at timestamptz,
  approval_notes text,
  rejected_by uuid references public.staff_accounts(id),
  rejected_at timestamptz,
  rejection_reason text,
  request_idempotency_key text not null,
  decision_idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_petty_cash_requests_amount_check check (requested_amount > 0 and (approved_amount is null or approved_amount > 0)),
  constraint operations_petty_cash_requests_status_check check (upper(status) in ('PENDING','APPROVED','REJECTED','DISBURSED','EVIDENCE_SUBMITTED','SETTLED')),
  constraint operations_petty_cash_requests_purpose_check check (nullif(btrim(purpose),'') is not null)
);

create table if not exists public.operations_petty_cash_disbursements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  fund_id uuid not null references public.operations_petty_cash_funds(id),
  request_id uuid not null unique references public.operations_petty_cash_requests(id),
  amount numeric(18,2) not null,
  currency_code text not null,
  disbursement_date date not null,
  disbursement_journal_id uuid not null references public.journal_entries(id),
  status text not null default 'OPEN',
  disbursed_by uuid not null references public.staff_accounts(id),
  disbursed_at timestamptz not null default now(),
  settlement_date date,
  settlement_reference text,
  settlement_journal_id uuid references public.journal_entries(id),
  settled_by uuid references public.staff_accounts(id),
  settled_at timestamptz,
  cash_returned numeric(18,2),
  disbursement_idempotency_key text not null,
  settlement_idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_petty_cash_disbursements_amount_check check (amount > 0),
  constraint operations_petty_cash_disbursements_return_check check (cash_returned is null or cash_returned >= 0),
  constraint operations_petty_cash_disbursements_status_check check (upper(status) in ('OPEN','EVIDENCE_SUBMITTED','SETTLED'))
);

create table if not exists public.operations_petty_cash_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  disbursement_id uuid not null references public.operations_petty_cash_disbursements(id),
  expense_account_id uuid not null references public.chart_of_accounts(id),
  amount numeric(18,2) not null,
  currency_code text not null,
  receipt_date date not null,
  receipt_reference text not null,
  supplier text,
  evidence_url text not null,
  notes text,
  submitted_by uuid not null references public.staff_accounts(id),
  submitted_at timestamptz not null default now(),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint operations_petty_cash_receipts_amount_check check (amount > 0),
  constraint operations_petty_cash_receipts_reference_check check (nullif(btrim(receipt_reference),'') is not null),
  constraint operations_petty_cash_receipts_evidence_check check (nullif(btrim(evidence_url),'') is not null)
);

create table if not exists public.operations_petty_cash_replenishments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  fund_id uuid not null references public.operations_petty_cash_funds(id),
  cash_transfer_id uuid not null unique references public.operations_cash_transfers(id),
  amount numeric(18,2) not null,
  currency_code text not null,
  reason text not null,
  replenished_by uuid not null references public.staff_accounts(id),
  replenished_at timestamptz not null default now(),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint operations_petty_cash_replenishments_amount_check check (amount > 0),
  constraint operations_petty_cash_replenishments_reason_check check (nullif(btrim(reason),'') is not null)
);

create unique index if not exists operations_petty_cash_requests_request_idem_uidx on public.operations_petty_cash_requests (organization_id,entity_id,request_idempotency_key);
create unique index if not exists operations_petty_cash_requests_decision_idem_uidx on public.operations_petty_cash_requests (organization_id,entity_id,decision_idempotency_key) where decision_idempotency_key is not null;
create unique index if not exists operations_petty_cash_disbursements_idem_uidx on public.operations_petty_cash_disbursements (organization_id,entity_id,disbursement_idempotency_key);
create unique index if not exists operations_petty_cash_disbursements_settlement_idem_uidx on public.operations_petty_cash_disbursements (organization_id,entity_id,settlement_idempotency_key) where settlement_idempotency_key is not null;
create unique index if not exists operations_petty_cash_receipts_idem_uidx on public.operations_petty_cash_receipts (organization_id,entity_id,idempotency_key);
create unique index if not exists operations_petty_cash_replenishments_idem_uidx on public.operations_petty_cash_replenishments (organization_id,entity_id,idempotency_key);
create index if not exists operations_petty_cash_requests_scope_status_idx on public.operations_petty_cash_requests (organization_id,entity_id,status,created_at desc);
create index if not exists operations_petty_cash_receipts_disbursement_idx on public.operations_petty_cash_receipts (disbursement_id,created_at);

alter table public.operations_petty_cash_funds enable row level security;
alter table public.operations_petty_cash_requests enable row level security;
alter table public.operations_petty_cash_disbursements enable row level security;
alter table public.operations_petty_cash_receipts enable row level security;
alter table public.operations_petty_cash_replenishments enable row level security;
revoke all on public.operations_petty_cash_funds, public.operations_petty_cash_requests, public.operations_petty_cash_disbursements, public.operations_petty_cash_receipts, public.operations_petty_cash_replenishments from public,anon,authenticated;
grant all on public.operations_petty_cash_funds, public.operations_petty_cash_requests, public.operations_petty_cash_disbursements, public.operations_petty_cash_receipts, public.operations_petty_cash_replenishments to service_role;

create or replace function public.operations_petty_cash_actor_role(p_organization_id uuid,p_actor_id uuid) returns text language plpgsql security invoker set search_path='' as $$
declare v_role text;
begin
  select upper(pg_catalog.btrim(coalesce(ou.role,sa.role,''))) into v_role from public.staff_accounts sa left join public.organization_users ou on ou.staff_account_id=sa.id and ou.organization_id=p_organization_id and lower(coalesce(ou.status,'active'))='active' where sa.id=p_actor_id and coalesce(sa.active,true)=true and (sa.active_organization_id=p_organization_id or ou.id is not null) order by ou.created_at desc nulls last limit 1;
  return nullif(v_role,'');
end;$$;
revoke all on function public.operations_petty_cash_actor_role(uuid,uuid) from public,anon,authenticated;
grant execute on function public.operations_petty_cash_actor_role(uuid,uuid) to service_role;

create or replace function public.operations_configure_petty_cash_fund_atomic(p_organization_id uuid,p_entity_id uuid,p_cash_location_id uuid,p_advance_account_id uuid,p_replenish_source_location_id uuid,p_target_balance numeric,p_actor_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_currency text; v_cash public.operations_cash_locations%rowtype; v_source public.operations_cash_locations%rowtype; v_advance public.chart_of_accounts%rowtype; v_fund public.operations_petty_cash_funds%rowtype;
begin
  v_role:=public.operations_petty_cash_actor_role(p_organization_id,p_actor_id); if coalesce(v_role,'') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then raise exception 'Manager or owner role required to configure petty cash'; end if;
  select upper(currency) into v_currency from public.legal_entities where id=p_entity_id and organization_id=p_organization_id and coalesce(is_active,true)=true; if v_currency is null then raise exception 'Legal entity currency is unavailable'; end if;
  select * into v_cash from public.operations_cash_locations where id=p_cash_location_id and organization_id=p_organization_id and entity_id=p_entity_id and is_active=true for update; if not found or upper(coalesce(v_cash.location_type,''))<>'PETTY_CASH' then raise exception 'Active PETTY_CASH location required'; end if;
  select * into v_source from public.operations_cash_locations where id=p_replenish_source_location_id and organization_id=p_organization_id and entity_id=p_entity_id and is_active=true; if not found or upper(coalesce(v_source.location_type,''))='BANK_DEPOSIT' then raise exception 'Active non-transit replenishment source required'; end if;
  if v_source.id=v_cash.id then raise exception 'Replenishment source must differ from petty cash location'; end if; if upper(v_cash.currency_code)<>v_currency or upper(v_source.currency_code)<>v_currency then raise exception 'Petty cash location currency mismatch'; end if;
  select * into v_advance from public.chart_of_accounts where id=p_advance_account_id and organization_id=p_organization_id and entity_id=p_entity_id and coalesce(is_active,true)=true; if not found then raise exception 'Petty cash advance account is unavailable'; end if;
  if upper(coalesce(v_advance.account_category,'')) not like 'ASSET%' then raise exception 'Petty cash advance account must be an asset account'; end if; if upper(coalesce(v_advance.account_type,''))='CASH' then raise exception 'Petty cash advance account must be a clearing asset, not another cash account'; end if; if v_advance.id in (v_cash.finance_account_id,v_source.finance_account_id) then raise exception 'Petty cash advance account must differ from custody cash accounts'; end if; if nullif(upper(coalesce(v_advance.currency_code,'')),'') is not null and upper(v_advance.currency_code)<>v_currency then raise exception 'Petty cash advance account currency mismatch'; end if; if p_target_balance is not null and p_target_balance<0 then raise exception 'Target balance cannot be negative'; end if;
  insert into public.operations_petty_cash_funds(organization_id,entity_id,cash_location_id,advance_account_id,replenish_source_location_id,currency_code,target_balance,is_active,created_by,updated_by) values(p_organization_id,p_entity_id,p_cash_location_id,p_advance_account_id,p_replenish_source_location_id,v_currency,p_target_balance,true,p_actor_id,p_actor_id) on conflict (organization_id,entity_id,cash_location_id) do update set advance_account_id=excluded.advance_account_id,replenish_source_location_id=excluded.replenish_source_location_id,currency_code=excluded.currency_code,target_balance=excluded.target_balance,is_active=true,updated_by=p_actor_id,updated_at=now() returning * into v_fund;
  return jsonb_build_object('success',true,'fund',to_jsonb(v_fund));
end;$$;
revoke all on function public.operations_configure_petty_cash_fund_atomic(uuid,uuid,uuid,uuid,uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.operations_configure_petty_cash_fund_atomic(uuid,uuid,uuid,uuid,uuid,numeric,uuid) to service_role;

create or replace function public.operations_create_petty_cash_request_atomic(p_organization_id uuid,p_entity_id uuid,p_source_application_id text,p_fund_id uuid,p_purpose text,p_requested_amount numeric,p_actor_id uuid,p_idempotency_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_amount numeric(18,2):=round(coalesce(p_requested_amount,0)::numeric,2); v_purpose text:=pg_catalog.btrim(coalesce(p_purpose,'')); v_key text:=pg_catalog.btrim(coalesce(p_idempotency_key,'')); v_fund public.operations_petty_cash_funds%rowtype; v_existing public.operations_petty_cash_requests%rowtype; v_request public.operations_petty_cash_requests%rowtype; v_event jsonb;
begin
  v_role:=public.operations_petty_cash_actor_role(p_organization_id,p_actor_id); if v_role is null then raise exception 'Active organization staff account required'; end if; if v_amount<=0 then raise exception 'Requested amount must be greater than zero'; end if; if nullif(v_purpose,'') is null then raise exception 'Business purpose required'; end if; if nullif(v_key,'') is null then raise exception 'idempotencyKey required'; end if;
  select * into v_existing from public.operations_petty_cash_requests where organization_id=p_organization_id and entity_id=p_entity_id and request_idempotency_key=v_key limit 1; if found then return jsonb_build_object('success',true,'duplicate',true,'request',to_jsonb(v_existing)); end if;
  select * into v_fund from public.operations_petty_cash_funds where id=p_fund_id and organization_id=p_organization_id and entity_id=p_entity_id and is_active=true; if not found then raise exception 'Active petty cash fund required'; end if;
  insert into public.operations_petty_cash_requests(organization_id,entity_id,fund_id,source_application_id,requester_staff_id,purpose,requested_amount,currency_code,status,request_idempotency_key,metadata) values(p_organization_id,p_entity_id,p_fund_id,nullif(lower(pg_catalog.btrim(coalesce(p_source_application_id,''))),''),p_actor_id,v_purpose,v_amount,v_fund.currency_code,'PENDING',v_key,jsonb_build_object('requester_role',v_role)) returning * into v_request;
  v_event:=public.record_system_event_atomic(p_organization_id,'OPERATIONS_PETTY_CASH_REQUESTED',jsonb_build_object('organization_id',p_organization_id,'entity_id',p_entity_id,'request_id',v_request.id,'fund_id',p_fund_id,'amount',v_amount,'currency_code',v_fund.currency_code,'purpose',v_purpose,'actor_id',p_actor_id),'operations-petty-cash-requested:'||v_request.id::text);
  return jsonb_build_object('success',true,'duplicate',false,'request',to_jsonb(v_request),'event_id',v_event->'event'->>'id');
end;$$;
revoke all on function public.operations_create_petty_cash_request_atomic(uuid,uuid,text,uuid,text,numeric,uuid,text) from public,anon,authenticated; grant execute on function public.operations_create_petty_cash_request_atomic(uuid,uuid,text,uuid,text,numeric,uuid,text) to service_role;

create or replace function public.operations_decide_petty_cash_request_atomic(p_organization_id uuid,p_entity_id uuid,p_request_id uuid,p_decision text,p_approved_amount numeric,p_notes text,p_actor_id uuid,p_idempotency_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_decision text:=upper(pg_catalog.btrim(coalesce(p_decision,''))); v_amount numeric(18,2):=round(coalesce(p_approved_amount,0)::numeric,2); v_key text:=pg_catalog.btrim(coalesce(p_idempotency_key,'')); v_request public.operations_petty_cash_requests%rowtype; v_event jsonb;
begin
  v_role:=public.operations_petty_cash_actor_role(p_organization_id,p_actor_id); if coalesce(v_role,'') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then raise exception 'Manager or owner role required to decide petty cash requests'; end if; if v_decision not in ('APPROVE','REJECT') then raise exception 'Decision must be APPROVE or REJECT'; end if; if nullif(v_key,'') is null then raise exception 'idempotencyKey required'; end if;
  select * into v_request from public.operations_petty_cash_requests where id=p_request_id and organization_id=p_organization_id and entity_id=p_entity_id for update; if not found then raise exception 'Petty cash request not found'; end if; if v_request.decision_idempotency_key=v_key then return jsonb_build_object('success',true,'duplicate',true,'request',to_jsonb(v_request)); end if; if upper(v_request.status)<>'PENDING' then raise exception 'Only pending petty cash requests can be decided'; end if; if v_request.requester_staff_id=p_actor_id and v_role not in ('OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then raise exception 'Managers cannot approve their own petty cash request'; end if;
  if v_decision='APPROVE' then if v_amount<=0 or v_amount>v_request.requested_amount then raise exception 'Approved amount must be greater than zero and not exceed the requested amount'; end if; update public.operations_petty_cash_requests set status='APPROVED',approved_amount=v_amount,approved_by=p_actor_id,approved_at=now(),approval_notes=nullif(pg_catalog.btrim(coalesce(p_notes,'')),''),decision_idempotency_key=v_key,updated_at=now() where id=v_request.id returning * into v_request;
  else if nullif(pg_catalog.btrim(coalesce(p_notes,'')),'') is null then raise exception 'Rejection reason required'; end if; update public.operations_petty_cash_requests set status='REJECTED',rejected_by=p_actor_id,rejected_at=now(),rejection_reason=pg_catalog.btrim(p_notes),decision_idempotency_key=v_key,updated_at=now() where id=v_request.id returning * into v_request; end if;
  v_event:=public.record_system_event_atomic(p_organization_id,case when v_decision='APPROVE' then 'OPERATIONS_PETTY_CASH_APPROVED' else 'OPERATIONS_PETTY_CASH_REJECTED' end,jsonb_build_object('organization_id',p_organization_id,'entity_id',p_entity_id,'request_id',v_request.id,'decision',v_decision,'approved_amount',v_request.approved_amount,'currency_code',v_request.currency_code,'actor_id',p_actor_id),'operations-petty-cash-decision:'||v_request.id::text);
  return jsonb_build_object('success',true,'duplicate',false,'request',to_jsonb(v_request),'event_id',v_event->'event'->>'id');
end;$$;
revoke all on function public.operations_decide_petty_cash_request_atomic(uuid,uuid,uuid,text,numeric,text,uuid,text) from public,anon,authenticated; grant execute on function public.operations_decide_petty_cash_request_atomic(uuid,uuid,uuid,text,numeric,text,uuid,text) to service_role;

create or replace function public.operations_disburse_petty_cash_atomic(p_organization_id uuid,p_entity_id uuid,p_request_id uuid,p_disbursement_date date,p_actor_id uuid,p_idempotency_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_key text:=pg_catalog.btrim(coalesce(p_idempotency_key,'')); v_request public.operations_petty_cash_requests%rowtype; v_fund public.operations_petty_cash_funds%rowtype; v_location public.operations_cash_locations%rowtype; v_existing public.operations_petty_cash_disbursements%rowtype; v_disb public.operations_petty_cash_disbursements%rowtype; v_lines jsonb; v_posting jsonb; v_journal_id uuid; v_event jsonb;
begin
  v_role:=public.operations_petty_cash_actor_role(p_organization_id,p_actor_id); if coalesce(v_role,'') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then raise exception 'Manager or owner role required to disburse petty cash'; end if; if p_disbursement_date is null then raise exception 'Disbursement date required'; end if; if nullif(v_key,'') is null then raise exception 'idempotencyKey required'; end if;
  select * into v_existing from public.operations_petty_cash_disbursements where organization_id=p_organization_id and entity_id=p_entity_id and disbursement_idempotency_key=v_key limit 1; if found then return jsonb_build_object('success',true,'duplicate',true,'disbursement',to_jsonb(v_existing)); end if; perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':'||p_entity_id::text||':petty-disburse',0));
  select * into v_request from public.operations_petty_cash_requests where id=p_request_id and organization_id=p_organization_id and entity_id=p_entity_id for update; if not found or upper(v_request.status)<>'APPROVED' then raise exception 'Approved petty cash request required'; end if;
  select * into v_fund from public.operations_petty_cash_funds where id=v_request.fund_id and organization_id=p_organization_id and entity_id=p_entity_id and is_active=true; if not found then raise exception 'Active petty cash fund required'; end if;
  select * into v_location from public.operations_cash_locations where id=v_fund.cash_location_id and organization_id=p_organization_id and entity_id=p_entity_id and is_active=true for update; if not found or upper(coalesce(v_location.location_type,''))<>'PETTY_CASH' then raise exception 'Petty cash custody location is unavailable'; end if; if round(coalesce(v_location.current_balance,0)::numeric,2)+0.005 < v_request.approved_amount then raise exception 'Petty cash fund has insufficient available balance'; end if;
  v_lines:=jsonb_build_array(jsonb_build_object('account_id',v_fund.advance_account_id,'debit',v_request.approved_amount,'credit',0,'description','Petty cash advance: '||v_request.purpose),jsonb_build_object('account_id',v_location.finance_account_id,'debit',0,'credit',v_request.approved_amount,'description','Petty cash disbursement: '||v_request.purpose));
  select public.finance_post_journal_atomic(p_organization_id=>p_organization_id,p_entity_id=>p_entity_id,p_posting_date=>p_disbursement_date,p_document_date=>p_disbursement_date,p_journal_type=>'SYSTEM',p_reference=>'operations-petty-disbursement:'||v_request.id::text,p_source_module=>'operations',p_source_document=>'OPERATIONS_PETTY_CASH_DISBURSEMENT',p_source_document_id=>v_request.id,p_description=>'Petty cash advance: '||v_request.purpose,p_currency_code=>v_request.currency_code,p_exchange_rate=>1,p_lines=>v_lines,p_created_by=>p_actor_id,p_idempotency_key=>'operations-petty-disbursement:'||v_request.id::text) into v_posting;
  v_journal_id:=nullif(v_posting->'journal'->>'id','')::uuid; if v_journal_id is null then raise exception 'Petty cash disbursement Finance posting failed'; end if;
  update public.operations_cash_locations set current_balance=round((current_balance-v_request.approved_amount)::numeric,2),updated_at=now() where id=v_location.id;
  insert into public.operations_petty_cash_disbursements(organization_id,entity_id,fund_id,request_id,amount,currency_code,disbursement_date,disbursement_journal_id,status,disbursed_by,disbursement_idempotency_key) values(p_organization_id,p_entity_id,v_fund.id,v_request.id,v_request.approved_amount,v_request.currency_code,p_disbursement_date,v_journal_id,'OPEN',p_actor_id,v_key) returning * into v_disb;
  update public.operations_petty_cash_requests set status='DISBURSED',updated_at=now() where id=v_request.id returning * into v_request;
  v_event:=public.record_system_event_atomic(p_organization_id,'OPERATIONS_PETTY_CASH_DISBURSED',jsonb_build_object('organization_id',p_organization_id,'entity_id',p_entity_id,'request_id',v_request.id,'disbursement_id',v_disb.id,'amount',v_disb.amount,'currency_code',v_disb.currency_code,'journal_entry_id',v_journal_id,'actor_id',p_actor_id),'operations-petty-cash-disbursed:'||v_disb.id::text);
  return jsonb_build_object('success',true,'duplicate',false,'request',to_jsonb(v_request),'disbursement',to_jsonb(v_disb),'event_id',v_event->'event'->>'id');
end;$$;
revoke all on function public.operations_disburse_petty_cash_atomic(uuid,uuid,uuid,date,uuid,text) from public,anon,authenticated; grant execute on function public.operations_disburse_petty_cash_atomic(uuid,uuid,uuid,date,uuid,text) to service_role;

create or replace function public.operations_add_petty_cash_receipt_atomic(p_organization_id uuid,p_entity_id uuid,p_disbursement_id uuid,p_expense_account_id uuid,p_amount numeric,p_receipt_date date,p_receipt_reference text,p_supplier text,p_evidence_url text,p_notes text,p_actor_id uuid,p_idempotency_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_amount numeric(18,2):=round(coalesce(p_amount,0)::numeric,2); v_key text:=pg_catalog.btrim(coalesce(p_idempotency_key,'')); v_disb public.operations_petty_cash_disbursements%rowtype; v_request public.operations_petty_cash_requests%rowtype; v_account public.chart_of_accounts%rowtype; v_existing public.operations_petty_cash_receipts%rowtype; v_receipt public.operations_petty_cash_receipts%rowtype; v_total numeric(18,2); v_event jsonb;
begin
  v_role:=public.operations_petty_cash_actor_role(p_organization_id,p_actor_id); if v_role is null then raise exception 'Active organization staff account required'; end if; if v_amount<=0 then raise exception 'Receipt amount must be greater than zero'; end if; if p_receipt_date is null then raise exception 'Receipt date required'; end if; if nullif(pg_catalog.btrim(coalesce(p_receipt_reference,'')),'') is null then raise exception 'Receipt reference required'; end if; if nullif(pg_catalog.btrim(coalesce(p_evidence_url,'')),'') is null then raise exception 'Receipt evidence URL required'; end if; if nullif(v_key,'') is null then raise exception 'idempotencyKey required'; end if;
  select * into v_existing from public.operations_petty_cash_receipts where organization_id=p_organization_id and entity_id=p_entity_id and idempotency_key=v_key limit 1; if found then return jsonb_build_object('success',true,'duplicate',true,'receipt',to_jsonb(v_existing)); end if;
  select * into v_disb from public.operations_petty_cash_disbursements where id=p_disbursement_id and organization_id=p_organization_id and entity_id=p_entity_id for update; if not found or upper(v_disb.status) not in ('OPEN','EVIDENCE_SUBMITTED') then raise exception 'Open petty cash disbursement required'; end if;
  select * into v_request from public.operations_petty_cash_requests where id=v_disb.request_id; if p_actor_id<>v_request.requester_staff_id and coalesce(v_role,'') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then raise exception 'Only the requester or a manager/owner can submit petty cash evidence'; end if;
  select * into v_account from public.chart_of_accounts where id=p_expense_account_id and organization_id=p_organization_id and entity_id=p_entity_id and coalesce(is_active,true)=true; if not found then raise exception 'Expense account is unavailable'; end if; if upper(coalesce(v_account.account_category,'')) not like '%EXPENSE%' and upper(coalesce(v_account.account_category,''))<>'COGS' then raise exception 'Petty cash receipt must use an expense or COGS account'; end if; if nullif(upper(coalesce(v_account.currency_code,'')),'') is not null and upper(v_account.currency_code)<>upper(v_disb.currency_code) then raise exception 'Expense account currency mismatch'; end if;
  select round(coalesce(sum(amount),0)::numeric,2) into v_total from public.operations_petty_cash_receipts where disbursement_id=v_disb.id; if v_total+v_amount>v_disb.amount+0.005 then raise exception 'Receipt total cannot exceed the petty cash amount disbursed'; end if;
  insert into public.operations_petty_cash_receipts(organization_id,entity_id,disbursement_id,expense_account_id,amount,currency_code,receipt_date,receipt_reference,supplier,evidence_url,notes,submitted_by,idempotency_key) values(p_organization_id,p_entity_id,v_disb.id,p_expense_account_id,v_amount,v_disb.currency_code,p_receipt_date,pg_catalog.btrim(p_receipt_reference),nullif(pg_catalog.btrim(coalesce(p_supplier,'')),''),pg_catalog.btrim(p_evidence_url),nullif(pg_catalog.btrim(coalesce(p_notes,'')),''),p_actor_id,v_key) returning * into v_receipt;
  update public.operations_petty_cash_disbursements set status='EVIDENCE_SUBMITTED',updated_at=now() where id=v_disb.id returning * into v_disb; update public.operations_petty_cash_requests set status='EVIDENCE_SUBMITTED',updated_at=now() where id=v_request.id returning * into v_request;
  v_event:=public.record_system_event_atomic(p_organization_id,'OPERATIONS_PETTY_CASH_RECEIPT_SUBMITTED',jsonb_build_object('organization_id',p_organization_id,'entity_id',p_entity_id,'request_id',v_request.id,'disbursement_id',v_disb.id,'receipt_id',v_receipt.id,'amount',v_receipt.amount,'currency_code',v_receipt.currency_code,'expense_account_id',p_expense_account_id,'actor_id',p_actor_id),'operations-petty-cash-receipt:'||v_receipt.id::text);
  return jsonb_build_object('success',true,'duplicate',false,'request',to_jsonb(v_request),'disbursement',to_jsonb(v_disb),'receipt',to_jsonb(v_receipt),'event_id',v_event->'event'->>'id');
end;$$;
revoke all on function public.operations_add_petty_cash_receipt_atomic(uuid,uuid,uuid,uuid,numeric,date,text,text,text,text,uuid,text) from public,anon,authenticated; grant execute on function public.operations_add_petty_cash_receipt_atomic(uuid,uuid,uuid,uuid,numeric,date,text,text,text,text,uuid,text) to service_role;

create or replace function public.operations_settle_petty_cash_atomic(p_organization_id uuid,p_entity_id uuid,p_disbursement_id uuid,p_settlement_date date,p_settlement_reference text,p_actor_id uuid,p_idempotency_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_key text:=pg_catalog.btrim(coalesce(p_idempotency_key,'')); v_reference text:=pg_catalog.btrim(coalesce(p_settlement_reference,'')); v_disb public.operations_petty_cash_disbursements%rowtype; v_request public.operations_petty_cash_requests%rowtype; v_fund public.operations_petty_cash_funds%rowtype; v_location public.operations_cash_locations%rowtype; v_total numeric(18,2); v_return numeric(18,2); v_lines jsonb; v_posting jsonb; v_journal_id uuid; v_event jsonb;
begin
  v_role:=public.operations_petty_cash_actor_role(p_organization_id,p_actor_id); if coalesce(v_role,'') not in ('ACCOUNTING','FINANCE','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then raise exception 'Accounting or owner role required to settle petty cash'; end if; if p_settlement_date is null then raise exception 'Settlement date required'; end if; if nullif(v_reference,'') is null then raise exception 'Settlement reference required'; end if; if nullif(v_key,'') is null then raise exception 'idempotencyKey required'; end if;
  select * into v_disb from public.operations_petty_cash_disbursements where id=p_disbursement_id and organization_id=p_organization_id and entity_id=p_entity_id for update; if not found then raise exception 'Petty cash disbursement not found'; end if; if v_disb.settlement_idempotency_key=v_key and upper(v_disb.status)='SETTLED' then return jsonb_build_object('success',true,'duplicate',true,'disbursement',to_jsonb(v_disb)); end if; if upper(v_disb.status)<>'EVIDENCE_SUBMITTED' then raise exception 'Receipt evidence must be submitted before settlement'; end if;
  select round(coalesce(sum(amount),0)::numeric,2) into v_total from public.operations_petty_cash_receipts where disbursement_id=v_disb.id; if v_total<=0 then raise exception 'At least one receipt is required for settlement'; end if; if v_total>v_disb.amount+0.005 then raise exception 'Receipt total exceeds disbursed petty cash'; end if; v_return:=round((v_disb.amount-v_total)::numeric,2);
  select * into v_request from public.operations_petty_cash_requests where id=v_disb.request_id for update; select * into v_fund from public.operations_petty_cash_funds where id=v_disb.fund_id and organization_id=p_organization_id and entity_id=p_entity_id and is_active=true; if not found then raise exception 'Active petty cash fund required'; end if; select * into v_location from public.operations_cash_locations where id=v_fund.cash_location_id and organization_id=p_organization_id and entity_id=p_entity_id and is_active=true for update; if not found then raise exception 'Petty cash custody location is unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('account_id',r.expense_account_id,'debit',r.amount,'credit',0,'description','Petty cash receipt '||r.receipt_reference) order by r.created_at),'[]'::jsonb) into v_lines from public.operations_petty_cash_receipts r where r.disbursement_id=v_disb.id;
  if v_return>0 then v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_location.finance_account_id,'debit',v_return,'credit',0,'description','Unused petty cash returned')); end if; v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_fund.advance_account_id,'debit',0,'credit',v_disb.amount,'description','Clear petty cash advance'));
  select public.finance_post_journal_atomic(p_organization_id=>p_organization_id,p_entity_id=>p_entity_id,p_posting_date=>p_settlement_date,p_document_date=>p_settlement_date,p_journal_type=>'SYSTEM',p_reference=>'operations-petty-settlement:'||v_disb.id::text,p_source_module=>'operations',p_source_document=>'OPERATIONS_PETTY_CASH_SETTLEMENT',p_source_document_id=>v_disb.id,p_description=>'Petty cash settlement: '||v_reference,p_currency_code=>v_disb.currency_code,p_exchange_rate=>1,p_lines=>v_lines,p_created_by=>p_actor_id,p_idempotency_key=>'operations-petty-settlement:'||v_disb.id::text) into v_posting;
  v_journal_id:=nullif(v_posting->'journal'->>'id','')::uuid; if v_journal_id is null then raise exception 'Petty cash settlement Finance posting failed'; end if; if v_return>0 then update public.operations_cash_locations set current_balance=round((current_balance+v_return)::numeric,2),updated_at=now() where id=v_location.id; end if;
  update public.operations_petty_cash_disbursements set status='SETTLED',settlement_date=p_settlement_date,settlement_reference=v_reference,settlement_journal_id=v_journal_id,settled_by=p_actor_id,settled_at=now(),cash_returned=v_return,settlement_idempotency_key=v_key,updated_at=now() where id=v_disb.id returning * into v_disb; update public.operations_petty_cash_requests set status='SETTLED',updated_at=now() where id=v_request.id returning * into v_request;
  v_event:=public.record_system_event_atomic(p_organization_id,'OPERATIONS_PETTY_CASH_SETTLED',jsonb_build_object('organization_id',p_organization_id,'entity_id',p_entity_id,'request_id',v_request.id,'disbursement_id',v_disb.id,'receipt_total',v_total,'cash_returned',v_return,'currency_code',v_disb.currency_code,'journal_entry_id',v_journal_id,'actor_id',p_actor_id),'operations-petty-cash-settled:'||v_disb.id::text);
  return jsonb_build_object('success',true,'duplicate',false,'request',to_jsonb(v_request),'disbursement',to_jsonb(v_disb),'receipt_total',v_total,'cash_returned',v_return,'journal_entry_id',v_journal_id,'event_id',v_event->'event'->>'id');
end;$$;
revoke all on function public.operations_settle_petty_cash_atomic(uuid,uuid,uuid,date,text,uuid,text) from public,anon,authenticated; grant execute on function public.operations_settle_petty_cash_atomic(uuid,uuid,uuid,date,text,uuid,text) to service_role;

create or replace function public.operations_replenish_petty_cash_atomic(p_organization_id uuid,p_entity_id uuid,p_fund_id uuid,p_amount numeric,p_reason text,p_actor_id uuid,p_idempotency_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_amount numeric(18,2):=round(coalesce(p_amount,0)::numeric,2); v_reason text:=pg_catalog.btrim(coalesce(p_reason,'')); v_key text:=pg_catalog.btrim(coalesce(p_idempotency_key,'')); v_fund public.operations_petty_cash_funds%rowtype; v_existing public.operations_petty_cash_replenishments%rowtype; v_transfer jsonb; v_transfer_id uuid; v_replenishment public.operations_petty_cash_replenishments%rowtype; v_event jsonb;
begin
  v_role:=public.operations_petty_cash_actor_role(p_organization_id,p_actor_id); if coalesce(v_role,'') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then raise exception 'Manager or owner role required to replenish petty cash'; end if; if v_amount<=0 then raise exception 'Replenishment amount must be greater than zero'; end if; if nullif(v_reason,'') is null then raise exception 'Replenishment reason required'; end if; if nullif(v_key,'') is null then raise exception 'idempotencyKey required'; end if;
  select * into v_existing from public.operations_petty_cash_replenishments where organization_id=p_organization_id and entity_id=p_entity_id and idempotency_key=v_key limit 1; if found then return jsonb_build_object('success',true,'duplicate',true,'replenishment',to_jsonb(v_existing)); end if;
  select * into v_fund from public.operations_petty_cash_funds where id=p_fund_id and organization_id=p_organization_id and entity_id=p_entity_id and is_active=true; if not found then raise exception 'Active petty cash fund required'; end if;
  select public.operations_record_cash_transfer_atomic(p_organization_id=>p_organization_id,p_entity_id=>p_entity_id,p_application_id=>'operations',p_transfer_type=>'LOCATION_TO_LOCATION',p_source_location_id=>v_fund.replenish_source_location_id,p_destination_location_id=>v_fund.cash_location_id,p_source_cash_session_id=>null,p_destination_cash_session_id=>null,p_amount=>v_amount,p_actor_id=>p_actor_id,p_actor_role=>v_role,p_reason=>'Petty cash replenishment: '||v_reason,p_idempotency_key=>'petty-replenishment-transfer:'||v_key) into v_transfer;
  v_transfer_id:=nullif(v_transfer->'transfer'->>'id','')::uuid; if v_transfer_id is null then raise exception 'Petty cash replenishment transfer failed'; end if;
  insert into public.operations_petty_cash_replenishments(organization_id,entity_id,fund_id,cash_transfer_id,amount,currency_code,reason,replenished_by,idempotency_key) values(p_organization_id,p_entity_id,v_fund.id,v_transfer_id,v_amount,v_fund.currency_code,v_reason,p_actor_id,v_key) returning * into v_replenishment;
  v_event:=public.record_system_event_atomic(p_organization_id,'OPERATIONS_PETTY_CASH_REPLENISHED',jsonb_build_object('organization_id',p_organization_id,'entity_id',p_entity_id,'fund_id',v_fund.id,'replenishment_id',v_replenishment.id,'cash_transfer_id',v_transfer_id,'amount',v_amount,'currency_code',v_fund.currency_code,'actor_id',p_actor_id),'operations-petty-cash-replenished:'||v_replenishment.id::text);
  return jsonb_build_object('success',true,'duplicate',false,'replenishment',to_jsonb(v_replenishment),'cash_transfer',v_transfer->'transfer','event_id',v_event->'event'->>'id');
end;$$;
revoke all on function public.operations_replenish_petty_cash_atomic(uuid,uuid,uuid,numeric,text,uuid,text) from public,anon,authenticated; grant execute on function public.operations_replenish_petty_cash_atomic(uuid,uuid,uuid,numeric,text,uuid,text) to service_role;