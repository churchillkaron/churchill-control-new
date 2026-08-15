begin;

alter table public.pos_shifts
  add column if not exists closed_by uuid,
  add column if not exists closed_by_name text,
  add column if not exists reconciled_at timestamptz;

create unique index if not exists ux_pos_shifts_one_active_scope
  on public.pos_shifts (organization_id, entity_id, application_id)
  where upper(coalesce(status, '')) in ('OPEN', 'ACTIVE');

create or replace function public.guard_payment_cash_session_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.cash_session_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.cash_session_id is not distinct from old.cash_session_id
     and new.organization_id is not distinct from old.organization_id
     and new.entity_id is not distinct from old.entity_id
     and new.application_id is not distinct from old.application_id then
    return new;
  end if;

  if new.organization_id is null or new.entity_id is null or nullif(trim(coalesce(new.application_id, '')), '') is null then
    raise exception 'Cash-session payment requires organization, entity and application scope';
  end if;

  perform 1
  from public.pos_shifts shift
  where shift.id = new.cash_session_id
    and shift.organization_id = new.organization_id
    and shift.entity_id = new.entity_id
    and shift.application_id = lower(trim(new.application_id))
    and upper(coalesce(shift.status, '')) in ('OPEN', 'ACTIVE')
    and coalesce(shift.locked, false) = false
  for share;

  if not found then
    raise exception 'Selected POS cash session is not active in this organization, entity and application';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_payment_cash_session_scope() from public;
revoke all on function public.guard_payment_cash_session_scope() from anon;
revoke all on function public.guard_payment_cash_session_scope() from authenticated;
grant execute on function public.guard_payment_cash_session_scope() to service_role;

drop trigger if exists trg_payment_cash_session_scope on public.payments;
create trigger trg_payment_cash_session_scope
before insert or update on public.payments
for each row
execute function public.guard_payment_cash_session_scope();

create or replace function public.pos_open_cash_session_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_staff_id uuid,
  p_staff_name text,
  p_opening_cash numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application_id text := lower(trim(coalesce(p_application_id, '')));
  v_opening_cash numeric(18,2) := round(coalesce(p_opening_cash, 0)::numeric, 2);
  v_shift public.pos_shifts%rowtype;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if nullif(v_application_id, '') is null then raise exception 'applicationId required'; end if;
  if p_staff_id is null then raise exception 'Authenticated operator required'; end if;
  if v_opening_cash < 0 then raise exception 'Opening cash cannot be negative'; end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id
    and is_active = true;

  if not found then
    raise exception 'Selected legal entity is outside the organization or inactive';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':' || v_application_id || ':pos-cash-session',
      0
    )
  );

  select *
  into v_shift
  from public.pos_shifts
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and application_id = v_application_id
    and upper(coalesce(status, '')) in ('OPEN', 'ACTIVE')
  order by created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'session', to_jsonb(v_shift)
    );
  end if;

  insert into public.pos_shifts (
    organization_id,
    entity_id,
    application_id,
    staff_id,
    staff_name,
    opening_cash,
    expected_cash,
    closing_cash,
    variance,
    cash_total,
    card_total,
    qr_total,
    transfer_total,
    net_sales,
    reversal_total,
    refund_total,
    status,
    opened_at,
    locked,
    approval_status,
    accounting_status,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    v_application_id,
    p_staff_id,
    nullif(trim(coalesce(p_staff_name, '')), ''),
    v_opening_cash,
    v_opening_cash,
    0,
    0,
    0,0,0,0,0,0,0,
    'OPEN',
    now(),
    false,
    'PENDING',
    'PENDING',
    now(),
    now()
  )
  returning * into v_shift;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'session', to_jsonb(v_shift)
  );
end;
$$;

revoke all on function public.pos_open_cash_session_atomic(uuid,uuid,text,uuid,text,numeric) from public;
revoke all on function public.pos_open_cash_session_atomic(uuid,uuid,text,uuid,text,numeric) from anon;
revoke all on function public.pos_open_cash_session_atomic(uuid,uuid,text,uuid,text,numeric) from authenticated;
grant execute on function public.pos_open_cash_session_atomic(uuid,uuid,text,uuid,text,numeric) to service_role;

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
  v_application_id text := lower(trim(coalesce(p_application_id, '')));
  v_closing_cash numeric(18,2) := round(coalesce(p_closing_cash, 0)::numeric, 2);
  v_cash_total numeric(18,2) := 0;
  v_card_total numeric(18,2) := 0;
  v_qr_total numeric(18,2) := 0;
  v_transfer_total numeric(18,2) := 0;
  v_net_sales numeric(18,2) := 0;
  v_expected_cash numeric(18,2) := 0;
  v_variance numeric(18,2) := 0;
  v_shift public.pos_shifts%rowtype;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if nullif(v_application_id, '') is null then raise exception 'applicationId required'; end if;
  if p_session_id is null then raise exception 'sessionId required'; end if;
  if p_closed_by is null then raise exception 'Authenticated operator required'; end if;
  if v_closing_cash < 0 then raise exception 'Closing cash cannot be negative'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':' || v_application_id || ':pos-cash-session',
      0
    )
  );

  select *
  into v_shift
  from public.pos_shifts
  where id = p_session_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and application_id = v_application_id
  for update;

  if not found then
    raise exception 'POS cash session not found in selected scope';
  end if;

  if upper(coalesce(v_shift.status, '')) = 'CLOSED' then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'session', to_jsonb(v_shift)
    );
  end if;

  if upper(coalesce(v_shift.status, '')) not in ('OPEN', 'ACTIVE') or coalesce(v_shift.locked, false) then
    raise exception 'POS cash session is not active';
  end if;

  select
    round(coalesce(sum(case
      when upper(trim(coalesce(payment_method, ''))) = 'CASH' then amount
      else 0
    end), 0)::numeric, 2),
    round(coalesce(sum(case
      when upper(trim(coalesce(payment_method, ''))) in ('CARD', 'CREDIT_CARD') then amount
      else 0
    end), 0)::numeric, 2),
    round(coalesce(sum(case
      when upper(trim(coalesce(payment_method, ''))) in ('QR', 'QR_PAYMENT') then amount
      else 0
    end), 0)::numeric, 2),
    round(coalesce(sum(case
      when upper(trim(coalesce(payment_method, ''))) in ('TRANSFER', 'BANK_TRANSFER') then amount
      else 0
    end), 0)::numeric, 2),
    round(coalesce(sum(amount), 0)::numeric, 2)
  into
    v_cash_total,
    v_card_total,
    v_qr_total,
    v_transfer_total,
    v_net_sales
  from public.payments
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and application_id = v_application_id
    and cash_session_id = p_session_id
    and upper(coalesce(status, '')) in ('PAID', 'COMPLETED');

  v_expected_cash := round((coalesce(v_shift.opening_cash, 0) + v_cash_total)::numeric, 2);
  v_variance := round((v_closing_cash - v_expected_cash)::numeric, 2);

  update public.pos_shifts
  set cash_total = v_cash_total,
      card_total = v_card_total,
      qr_total = v_qr_total,
      transfer_total = v_transfer_total,
      net_sales = v_net_sales,
      expected_cash = v_expected_cash,
      closing_cash = v_closing_cash,
      variance = v_variance,
      status = 'CLOSED',
      closed_at = now(),
      reconciled_at = now(),
      closed_by = p_closed_by,
      closed_by_name = nullif(trim(coalesce(p_closed_by_name, '')), ''),
      reconciliation_notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), reconciliation_notes),
      locked = true,
      updated_at = now()
  where id = p_session_id
  returning * into v_shift;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'session', to_jsonb(v_shift),
    'reconciliation', jsonb_build_object(
      'opening_cash', coalesce(v_shift.opening_cash, 0),
      'cash_total', v_cash_total,
      'card_total', v_card_total,
      'qr_total', v_qr_total,
      'transfer_total', v_transfer_total,
      'net_sales', v_net_sales,
      'expected_cash', v_expected_cash,
      'closing_cash', v_closing_cash,
      'variance', v_variance
    )
  );
end;
$$;

revoke all on function public.pos_close_cash_session_atomic(uuid,uuid,text,uuid,numeric,uuid,text,text) from public;
revoke all on function public.pos_close_cash_session_atomic(uuid,uuid,text,uuid,numeric,uuid,text,text) from anon;
revoke all on function public.pos_close_cash_session_atomic(uuid,uuid,text,uuid,numeric,uuid,text,text) from authenticated;
grant execute on function public.pos_close_cash_session_atomic(uuid,uuid,text,uuid,numeric,uuid,text,text) to service_role;

commit;
