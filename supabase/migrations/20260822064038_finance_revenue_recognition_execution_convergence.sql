begin;

alter table public.finance_revenue_recognition_schedules
  add column if not exists exchange_rate numeric(20,10) not null default 1;

alter table public.finance_revenue_recognition_schedules
  drop constraint if exists finance_revenue_recognition_exchange_rate_chk;

alter table public.finance_revenue_recognition_schedules
  add constraint finance_revenue_recognition_exchange_rate_chk
  check (exchange_rate > 0);

create or replace function public.finance_validate_revenue_recognition_schedule()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_method text;
begin
  new.source_document_type := upper(btrim(coalesce(new.source_document_type, '')));
  new.currency_code := upper(btrim(coalesce(new.currency_code, '')));
  v_method := upper(btrim(coalesce(new.recognition_method, new.method, 'STRAIGHT_LINE')));
  new.recognition_method := v_method;
  new.method := v_method;
  new.contract_reference := nullif(btrim(coalesce(new.contract_reference, new.contract_number, '')), '');
  new.contract_number := new.contract_reference;

  if new.organization_id is null then raise exception 'organization_id required'; end if;
  if new.entity_id is null then raise exception 'entity_id required'; end if;
  if new.source_document_type = '' then raise exception 'Revenue Recognition Source Document required'; end if;
  if v_method not in ('STRAIGHT_LINE','MANUAL') then
    raise exception 'Revenue Recognition method is not supported';
  end if;
  if new.start_date is null or new.end_date is null then raise exception 'Revenue Recognition dates required'; end if;
  if new.start_date > new.end_date then raise exception 'Revenue Recognition Start Date cannot be after End Date'; end if;
  if new.total_amount is null or new.total_amount <= 0 then raise exception 'Revenue Recognition Total Amount must be greater than zero'; end if;
  if new.currency_code = '' then raise exception 'Revenue Recognition Currency required'; end if;
  if new.exchange_rate is null or new.exchange_rate <= 0 then raise exception 'Revenue Recognition Exchange Rate must be greater than zero'; end if;
  if new.revenue_account_id is null or new.deferred_revenue_account_id is null then
    raise exception 'Revenue and Deferred Revenue Accounts required';
  end if;
  if new.revenue_account_id = new.deferred_revenue_account_id then
    raise exception 'Revenue and Deferred Revenue Accounts must be different';
  end if;

  perform 1 from public.legal_entities where id = new.entity_id and organization_id = new.organization_id;
  if not found then raise exception 'Revenue Recognition Legal Entity not found in organisation'; end if;

  perform 1 from public.chart_of_accounts
  where id = new.revenue_account_id and organization_id = new.organization_id and entity_id = new.entity_id and coalesce(is_active,true)=true;
  if not found then raise exception 'Revenue Account is outside selected Legal Entity or inactive'; end if;

  perform 1 from public.chart_of_accounts
  where id = new.deferred_revenue_account_id and organization_id = new.organization_id and entity_id = new.entity_id and coalesce(is_active,true)=true;
  if not found then raise exception 'Deferred Revenue Account is outside selected Legal Entity or inactive'; end if;

  if tg_op = 'INSERT' then
    new.recognized_amount := 0;
    new.deferred_amount := new.total_amount;
    new.status := 'ACTIVE';
  elsif coalesce(old.recognized_amount,0) > 0 then
    if new.total_amount is distinct from old.total_amount
       or new.start_date is distinct from old.start_date
       or new.end_date is distinct from old.end_date
       or new.recognition_method is distinct from old.recognition_method
       or new.currency_code is distinct from old.currency_code
       or new.exchange_rate is distinct from old.exchange_rate
       or new.revenue_account_id is distinct from old.revenue_account_id
       or new.deferred_revenue_account_id is distinct from old.deferred_revenue_account_id
    then
      raise exception 'Recognized Revenue schedule accounting terms are immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists finance_revenue_recognition_schedule_validate on public.finance_revenue_recognition_schedules;
create trigger finance_revenue_recognition_schedule_validate
before insert or update on public.finance_revenue_recognition_schedules
for each row execute function public.finance_validate_revenue_recognition_schedule();

create table if not exists public.finance_revenue_recognition_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  schedule_id uuid not null references public.finance_revenue_recognition_schedules(id) on delete restrict,
  recognition_date date not null,
  recognition_amount numeric(20,4) not null,
  idempotency_key text not null,
  status text not null default 'CLAIMED',
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  error_message text,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_revenue_recognition_runs_amount_chk check (recognition_amount > 0),
  constraint finance_revenue_recognition_runs_status_chk check (status in ('CLAIMED','COMPLETED','FAILED'))
);

create unique index if not exists finance_revenue_recognition_runs_idempotency_uidx
  on public.finance_revenue_recognition_runs(organization_id, entity_id, idempotency_key);

create unique index if not exists finance_revenue_recognition_runs_one_claim_uidx
  on public.finance_revenue_recognition_runs(schedule_id)
  where status = 'CLAIMED';

alter table public.finance_revenue_recognition_runs enable row level security;

create or replace function public.claim_finance_revenue_recognition(
  p_organization_id uuid,
  p_entity_id uuid,
  p_schedule_id uuid,
  p_recognition_date date,
  p_requested_amount numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_schedule public.finance_revenue_recognition_schedules%rowtype;
  v_existing public.finance_revenue_recognition_runs%rowtype;
  v_method text;
  v_amount numeric;
  v_target numeric;
  v_total_days integer;
  v_elapsed_days integer;
begin
  if p_organization_id is null or p_entity_id is null or p_schedule_id is null then raise exception 'Revenue Recognition scope required'; end if;
  if p_recognition_date is null then raise exception 'Revenue Recognition Date required'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'Revenue Recognition idempotency_key required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('revenue-recognition:' || p_schedule_id::text, 0));

  select * into v_existing from public.finance_revenue_recognition_runs
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and idempotency_key = btrim(p_idempotency_key)
  for update;

  if found then
    if v_existing.status = 'FAILED' then
      update public.finance_revenue_recognition_runs
      set status='CLAIMED', error_message=null, claimed_at=now(), updated_at=now()
      where id=v_existing.id;
    end if;
    return jsonb_build_object(
      'run_id', v_existing.id,
      'amount', v_existing.recognition_amount,
      'status', case when v_existing.status='FAILED' then 'CLAIMED' else v_existing.status end,
      'journal_entry_id', v_existing.journal_entry_id,
      'idempotent', true
    );
  end if;

  select * into v_schedule from public.finance_revenue_recognition_schedules
  where id = p_schedule_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then raise exception 'Revenue Recognition schedule not found'; end if;
  if upper(coalesce(v_schedule.status,'')) not in ('ACTIVE','PARTIALLY_RECOGNIZED') then
    raise exception 'Revenue Recognition schedule is not active';
  end if;
  if p_recognition_date < v_schedule.start_date or p_recognition_date > v_schedule.end_date then
    raise exception 'Revenue Recognition Date is outside the schedule period';
  end if;
  if coalesce(v_schedule.deferred_amount,0) <= 0 then raise exception 'Revenue Recognition schedule is fully recognized'; end if;

  v_method := upper(coalesce(v_schedule.recognition_method, v_schedule.method, 'STRAIGHT_LINE'));
  if v_method = 'STRAIGHT_LINE' then
    v_total_days := (v_schedule.end_date - v_schedule.start_date) + 1;
    v_elapsed_days := (p_recognition_date - v_schedule.start_date) + 1;
    v_target := round(v_schedule.total_amount * v_elapsed_days / v_total_days, 2);
    if p_recognition_date = v_schedule.end_date then v_target := v_schedule.total_amount; end if;
    v_amount := v_target - coalesce(v_schedule.recognized_amount,0);
  elsif v_method = 'MANUAL' then
    v_amount := p_requested_amount;
  else
    raise exception 'Revenue Recognition method is not supported';
  end if;

  if v_amount is null or v_amount <= 0 then raise exception 'No additional revenue is due for recognition on this date'; end if;
  if v_amount > v_schedule.deferred_amount then v_amount := v_schedule.deferred_amount; end if;

  insert into public.finance_revenue_recognition_runs(
    organization_id, entity_id, schedule_id, recognition_date, recognition_amount, idempotency_key, status
  ) values (
    p_organization_id, p_entity_id, p_schedule_id, p_recognition_date, v_amount, btrim(p_idempotency_key), 'CLAIMED'
  ) returning * into v_existing;

  return jsonb_build_object(
    'run_id', v_existing.id,
    'amount', v_existing.recognition_amount,
    'status', v_existing.status,
    'journal_entry_id', null,
    'idempotent', false
  );
end;
$$;

create or replace function public.finalize_finance_revenue_recognition(
  p_run_id uuid,
  p_journal_entry_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.finance_revenue_recognition_runs%rowtype;
  v_schedule public.finance_revenue_recognition_schedules%rowtype;
  v_recognized numeric;
  v_deferred numeric;
  v_status text;
begin
  if p_run_id is null or p_journal_entry_id is null then raise exception 'Revenue Recognition finalization fields required'; end if;

  select * into v_run from public.finance_revenue_recognition_runs where id=p_run_id for update;
  if not found then raise exception 'Revenue Recognition run not found'; end if;
  if v_run.status='COMPLETED' then
    return jsonb_build_object('success',true,'idempotent',true,'run_id',v_run.id,'journal_entry_id',v_run.journal_entry_id);
  end if;
  if v_run.status<>'CLAIMED' then raise exception 'Revenue Recognition run is not claimed'; end if;

  select * into v_schedule from public.finance_revenue_recognition_schedules
  where id=v_run.schedule_id and organization_id=v_run.organization_id and entity_id=v_run.entity_id
  for update;
  if not found then raise exception 'Revenue Recognition schedule not found'; end if;
  if v_run.recognition_amount > v_schedule.deferred_amount then raise exception 'Revenue Recognition amount exceeds remaining deferred revenue'; end if;

  v_recognized := round(coalesce(v_schedule.recognized_amount,0) + v_run.recognition_amount, 2);
  v_deferred := greatest(round(v_schedule.total_amount - v_recognized, 2), 0);
  v_status := case when v_deferred=0 then 'COMPLETED' else 'PARTIALLY_RECOGNIZED' end;

  update public.finance_revenue_recognition_runs
  set status='COMPLETED', journal_entry_id=p_journal_entry_id, completed_at=now(), error_message=null, updated_at=now()
  where id=v_run.id;

  update public.finance_revenue_recognition_schedules
  set recognized_amount=v_recognized,
      deferred_amount=v_deferred,
      last_journal_entry_id=p_journal_entry_id,
      status=v_status,
      updated_at=now()
  where id=v_schedule.id;

  return jsonb_build_object(
    'success',true,
    'idempotent',false,
    'run_id',v_run.id,
    'journal_entry_id',p_journal_entry_id,
    'recognized_amount',v_recognized,
    'deferred_amount',v_deferred,
    'status',v_status
  );
end;
$$;

revoke all on function public.finance_validate_revenue_recognition_schedule() from public;
revoke all on function public.finance_validate_revenue_recognition_schedule() from anon;
revoke all on function public.finance_validate_revenue_recognition_schedule() from authenticated;
revoke all on function public.claim_finance_revenue_recognition(uuid,uuid,uuid,date,numeric,text) from public;
revoke all on function public.claim_finance_revenue_recognition(uuid,uuid,uuid,date,numeric,text) from anon;
revoke all on function public.claim_finance_revenue_recognition(uuid,uuid,uuid,date,numeric,text) from authenticated;
grant execute on function public.claim_finance_revenue_recognition(uuid,uuid,uuid,date,numeric,text) to service_role;
revoke all on function public.finalize_finance_revenue_recognition(uuid,uuid) from public;
revoke all on function public.finalize_finance_revenue_recognition(uuid,uuid) from anon;
revoke all on function public.finalize_finance_revenue_recognition(uuid,uuid) from authenticated;
grant execute on function public.finalize_finance_revenue_recognition(uuid,uuid) to service_role;

commit;
