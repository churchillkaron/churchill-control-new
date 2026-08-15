begin;

alter table public.pos_shifts
  alter column approval_status set default 'PENDING',
  alter column accounting_status set default 'PENDING',
  alter column period_closed set default false;

update public.pos_shifts
set approval_status = coalesce(nullif(upper(trim(approval_status)), ''), 'PENDING'),
    accounting_status = coalesce(nullif(upper(trim(accounting_status)), ''), 'PENDING'),
    period_closed = coalesce(period_closed, false),
    updated_at = now()
where approval_status is null
   or nullif(trim(approval_status), '') is null
   or accounting_status is null
   or nullif(trim(accounting_status), '') is null
   or period_closed is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_shifts_approval_status_check'
      and conrelid = 'public.pos_shifts'::regclass
  ) then
    alter table public.pos_shifts
      add constraint pos_shifts_approval_status_check
      check (upper(coalesce(approval_status, 'PENDING')) in ('PENDING','APPROVED','REJECTED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_shifts_accounting_status_check'
      and conrelid = 'public.pos_shifts'::regclass
  ) then
    alter table public.pos_shifts
      add constraint pos_shifts_accounting_status_check
      check (upper(coalesce(accounting_status, 'PENDING')) in ('PENDING','BLOCKED','CONFIRMED'));
  end if;
end;
$$;

create or replace function public.guard_pos_shift_reconciliation_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(old.locked, false) = true
     and upper(coalesce(old.status, '')) = 'CLOSED'
     and (
       to_jsonb(new) - array[
         'approval_status','approved_by','approved_at',
         'accounting_status','accounting_confirmed_by','accounting_confirmed_at',
         'accounting_notes','period_closed','updated_at'
       ]::text[]
     ) is distinct from (
       to_jsonb(old) - array[
         'approval_status','approved_by','approved_at',
         'accounting_status','accounting_confirmed_by','accounting_confirmed_at',
         'accounting_notes','period_closed','updated_at'
       ]::text[]
     ) then
    raise exception 'Reconciled POS cash-session financial snapshot is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_pos_shift_reconciliation_immutability() from public, anon, authenticated;
grant execute on function public.guard_pos_shift_reconciliation_immutability() to service_role;

drop trigger if exists trg_pos_shift_reconciliation_immutability on public.pos_shifts;
create trigger trg_pos_shift_reconciliation_immutability
before update on public.pos_shifts
for each row execute function public.guard_pos_shift_reconciliation_immutability();

create or replace function public.guard_payment_cash_session_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session_id uuid;
  v_org_id uuid;
  v_entity_id uuid;
  v_app text;
begin
  v_session_id := new.cash_session_id;
  if v_session_id is null then return new; end if;

  v_org_id := new.organization_id;
  v_entity_id := new.entity_id;
  v_app := lower(trim(coalesce(new.application_id, '')));

  if v_org_id is null or v_entity_id is null or nullif(v_app, '') is null then
    raise exception 'Cash-session payment requires organization, entity and application scope';
  end if;

  perform 1
  from public.pos_shifts s
  where s.id = v_session_id
    and s.organization_id = v_org_id
    and s.entity_id = v_entity_id
    and lower(trim(coalesce(s.application_id, ''))) = v_app
    and upper(coalesce(s.status, '')) in ('OPEN','ACTIVE')
    and coalesce(s.locked, false) = false
  for share;

  if not found then
    raise exception 'Selected POS cash session is not active in this organization, entity and application';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_payment_cash_session_scope() from public, anon, authenticated;
grant execute on function public.guard_payment_cash_session_scope() to service_role;

drop trigger if exists trg_payment_cash_session_scope on public.payments;
create trigger trg_payment_cash_session_scope
before insert or update on public.payments
for each row execute function public.guard_payment_cash_session_scope();

create or replace function public.pos_review_cash_session_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_session_id uuid,
  p_decision text,
  p_actor_id uuid,
  p_actor_role text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app text := lower(trim(coalesce(p_application_id, '')));
  v_decision text := upper(trim(coalesce(p_decision, '')));
  v_role text;
  v_current text;
  v_shift public.pos_shifts%rowtype;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organizationId and entityId required'; end if;
  if nullif(v_app, '') is null or p_session_id is null then raise exception 'applicationId and sessionId required'; end if;
  if p_actor_id is null then raise exception 'Authenticated manager required'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'Decision must be APPROVE or REJECT'; end if;
  if v_decision = 'REJECT' and nullif(trim(coalesce(p_notes, '')), '') is null then raise exception 'Rejection reason required'; end if;

  select upper(trim(coalesce(ou.role, sa.role, p_actor_role, '')))
  into v_role
  from public.staff_accounts sa
  left join public.organization_users ou
    on ou.staff_account_id = sa.id
   and ou.organization_id = p_organization_id
   and lower(coalesce(ou.status, 'active')) = 'active'
  where sa.id = p_actor_id
    and coalesce(sa.active, true) = true
    and (sa.active_organization_id = p_organization_id or ou.id is not null)
  order by ou.created_at desc nulls last
  limit 1;

  if coalesce(v_role, '') not in ('MANAGER','GENERAL_MANAGER','OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then
    raise exception 'Manager or owner role required for POS cash-session review';
  end if;

  select * into v_shift
  from public.pos_shifts
  where id = p_session_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and lower(trim(coalesce(application_id, ''))) = v_app
  for update;

  if not found then raise exception 'POS cash session not found in selected scope'; end if;
  if upper(coalesce(v_shift.status, '')) <> 'CLOSED' or v_shift.reconciled_at is null or coalesce(v_shift.locked, false) = false then
    raise exception 'POS cash session must be reconciled and closed before review';
  end if;
  if coalesce(v_shift.period_closed, false) or upper(coalesce(v_shift.accounting_status, 'PENDING')) = 'CONFIRMED' then
    raise exception 'Accounting-confirmed POS cash session cannot be reviewed again';
  end if;

  v_current := upper(coalesce(v_shift.approval_status, 'PENDING'));
  if (v_current = 'APPROVED' and v_decision = 'APPROVE') or (v_current = 'REJECTED' and v_decision = 'REJECT') then
    return jsonb_build_object('success',true,'duplicate',true,'decision',v_decision,'session',to_jsonb(v_shift));
  end if;
  if v_current <> 'PENDING' then raise exception 'POS cash session review is already final: %', v_current; end if;

  if v_decision = 'APPROVE' then
    update public.pos_shifts
    set approval_status='APPROVED', approved_by=p_actor_id, approved_at=now(), accounting_status='PENDING', updated_at=now()
    where id=p_session_id returning * into v_shift;
  else
    update public.pos_shifts
    set approval_status='REJECTED', accounting_status='BLOCKED', updated_at=now()
    where id=p_session_id returning * into v_shift;
  end if;

  insert into public.approval_logs(
    organization_id,entity_type,entity_id,from_status,to_status,acted_by,role,notes,created_at
  ) values (
    p_organization_id,'pos_cash_session_reconciliation',p_session_id,v_current,
    case when v_decision='APPROVE' then 'APPROVED' else 'REJECTED' end,
    p_actor_id,v_role,nullif(trim(coalesce(p_notes,'')),''),now()
  );

  return jsonb_build_object('success',true,'duplicate',false,'decision',v_decision,'session',to_jsonb(v_shift));
end;
$$;

revoke all on function public.pos_review_cash_session_atomic(uuid,uuid,text,uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.pos_review_cash_session_atomic(uuid,uuid,text,uuid,text,uuid,text,text) to service_role;

create or replace function public.pos_confirm_cash_session_accounting_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_session_id uuid,
  p_actor_staff_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app text := lower(trim(coalesce(p_application_id, '')));
  v_role text;
  v_finance_role text;
  v_total numeric(18,2) := 0;
  v_missing_payments int := 0;
  v_missing_sales int := 0;
  v_shift public.pos_shifts%rowtype;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organizationId and entityId required'; end if;
  if nullif(v_app, '') is null or p_session_id is null then raise exception 'applicationId and sessionId required'; end if;
  if p_actor_staff_id is null or p_actor_user_id is null then raise exception 'Authenticated Finance actor required'; end if;

  select upper(trim(coalesce(ou.role, sa.role, p_actor_role, '')))
  into v_role
  from public.staff_accounts sa
  left join public.organization_users ou
    on ou.staff_account_id=sa.id
   and ou.organization_id=p_organization_id
   and lower(coalesce(ou.status,'active'))='active'
  where sa.id=p_actor_staff_id
    and coalesce(sa.active,true)=true
    and (sa.auth_user_id is null or sa.auth_user_id=p_actor_user_id)
    and (sa.active_organization_id=p_organization_id or ou.id is not null)
  order by ou.created_at desc nulls last
  limit 1;

  if coalesce(v_role,'') in ('OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN') then
    v_finance_role := v_role;
  else
    select fr.role_code into v_finance_role
    from public.user_finance_roles ufr
    join public.finance_roles fr
      on fr.id=ufr.role_id and fr.organization_id=ufr.organization_id and coalesce(fr.is_active,true)=true
    join public.finance_permissions fp
      on fp.organization_id=ufr.organization_id and fp.role_id=ufr.role_id and fp.permission_key='finance.close.execute'
    where ufr.organization_id=p_organization_id and ufr.user_id=p_actor_user_id
    order by ufr.assigned_at desc
    limit 1;
    if v_finance_role is null then raise exception 'Permission denied: finance.close.execute'; end if;
  end if;

  select * into v_shift
  from public.pos_shifts
  where id=p_session_id
    and organization_id=p_organization_id
    and entity_id=p_entity_id
    and lower(trim(coalesce(application_id,'')))=v_app
  for update;

  if not found then raise exception 'POS cash session not found in selected scope'; end if;
  if upper(coalesce(v_shift.accounting_status,'PENDING'))='CONFIRMED' and coalesce(v_shift.period_closed,false) then
    return jsonb_build_object('success',true,'duplicate',true,'session',to_jsonb(v_shift));
  end if;
  if upper(coalesce(v_shift.status,''))<>'CLOSED' or v_shift.reconciled_at is null or coalesce(v_shift.locked,false)=false then
    raise exception 'POS cash session must be reconciled and closed before accounting confirmation';
  end if;
  if upper(coalesce(v_shift.approval_status,'PENDING'))<>'APPROVED' then raise exception 'Manager approval is required before accounting confirmation'; end if;
  if upper(coalesce(v_shift.accounting_status,'PENDING'))='BLOCKED' then raise exception 'POS cash session is blocked from accounting confirmation'; end if;

  select round(coalesce(sum(p.amount),0)::numeric,2) into v_total
  from public.payments p
  where p.organization_id=p_organization_id
    and p.entity_id=p_entity_id
    and lower(trim(coalesce(p.application_id,'')))=v_app
    and p.cash_session_id=p_session_id
    and upper(coalesce(p.status,'')) in ('PAID','COMPLETED');

  if abs(v_total-round(coalesce(v_shift.net_sales,0)::numeric,2))>0.01 then
    raise exception 'POS cash-session settled payment total no longer matches reconciled net sales';
  end if;

  if v_app='restaurant' then
    select count(*)::int into v_missing_payments
    from public.payments p
    where p.organization_id=p_organization_id and p.entity_id=p_entity_id
      and lower(trim(coalesce(p.application_id,'')))=v_app and p.cash_session_id=p_session_id
      and upper(coalesce(p.status,'')) in ('PAID','COMPLETED')
      and not exists (
        select 1 from public.journal_entries j
        where j.organization_id=p_organization_id and j.entity_id=p_entity_id
          and j.source_module='pos' and j.source_document_id=p.id
          and j.source_document in ('POS_CASH_PAYMENT_RECEIVED','POS_CARD_PAYMENT_RECEIVED','POS_QR_PAYMENT_RECEIVED','POS_TRANSFER_PAYMENT_RECEIVED')
          and upper(coalesce(j.status,''))='POSTED'
      );
    if v_missing_payments>0 then raise exception 'Restaurant POS payment Finance posting is incomplete for % payment(s)',v_missing_payments; end if;

    select count(*)::int into v_missing_sales
    from (
      select distinct a.order_id
      from public.restaurant_payment_allocations a
      join public.payments p on p.id=a.payment_id and p.organization_id=a.organization_id
      where p.organization_id=p_organization_id and p.entity_id=p_entity_id
        and lower(trim(coalesce(p.application_id,'')))=v_app and p.cash_session_id=p_session_id
        and upper(coalesce(p.status,'')) in ('PAID','COMPLETED') and a.order_id is not null
    ) o
    where not exists (
      select 1 from public.journal_entries j
      where j.organization_id=p_organization_id and j.entity_id=p_entity_id
        and j.source_module='pos' and j.source_document='POS_SALE_RECOGNIZED'
        and j.source_document_id=o.order_id and upper(coalesce(j.status,''))='POSTED'
    );
    if v_missing_sales>0 then raise exception 'Restaurant POS sale Finance posting is incomplete for % order(s)',v_missing_sales; end if;
  elsif v_app='retail' then
    select count(*)::int into v_missing_payments
    from public.payments p
    where p.organization_id=p_organization_id and p.entity_id=p_entity_id
      and lower(trim(coalesce(p.application_id,'')))=v_app and p.cash_session_id=p_session_id
      and upper(coalesce(p.status,'')) in ('PAID','COMPLETED')
      and (p.journal_entry_id is null or not exists (
        select 1 from public.journal_entries j
        where j.id=p.journal_entry_id and j.organization_id=p_organization_id and j.entity_id=p_entity_id
          and j.source_module='commercial' and j.source_document='PAYMENT_RECEIVED'
          and j.source_document_id=p.id and upper(coalesce(j.status,''))='POSTED'
      ));
    if v_missing_payments>0 then raise exception 'Retail POS payment Finance posting is incomplete for % payment(s)',v_missing_payments; end if;
  else
    raise exception 'Accounting confirmation proof is not configured for POS application %',v_app;
  end if;

  update public.pos_shifts
  set accounting_status='CONFIRMED', accounting_confirmed_by=p_actor_staff_id,
      accounting_confirmed_at=now(), accounting_notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),accounting_notes),
      period_closed=true, updated_at=now()
  where id=p_session_id returning * into v_shift;

  insert into public.approval_logs(
    organization_id,entity_type,entity_id,from_status,to_status,acted_by,role,notes,created_at
  ) values (
    p_organization_id,'pos_cash_session_accounting',p_session_id,'PENDING','CONFIRMED',p_actor_staff_id,
    v_finance_role,nullif(trim(coalesce(p_notes,'')),''),now()
  );

  return jsonb_build_object(
    'success',true,'duplicate',false,
    'posting_evidence',jsonb_build_object('application_id',v_app,'settled_total',v_total,'missing_payment_journals',v_missing_payments,'missing_sale_journals',v_missing_sales),
    'session',to_jsonb(v_shift)
  );
end;
$$;

revoke all on function public.pos_confirm_cash_session_accounting_atomic(uuid,uuid,text,uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.pos_confirm_cash_session_accounting_atomic(uuid,uuid,text,uuid,uuid,uuid,text,text) to service_role;

commit;
