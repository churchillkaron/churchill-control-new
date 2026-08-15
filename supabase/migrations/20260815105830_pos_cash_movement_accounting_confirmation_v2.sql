begin;

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
  v_gross_total numeric(18,2) := 0;
  v_correction_total numeric(18,2) := 0;
  v_paid_in numeric(18,2) := 0;
  v_paid_out numeric(18,2) := 0;
  v_adjustment_in numeric(18,2) := 0;
  v_adjustment_out numeric(18,2) := 0;
  v_missing_payments int := 0;
  v_missing_sales int := 0;
  v_missing_corrections int := 0;
  v_missing_movements int := 0;
  v_variance_posting jsonb;
  v_variance_journal_id uuid;
  v_shift public.pos_shifts%rowtype;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organizationId and entityId required'; end if;
  if nullif(v_app, '') is null or p_session_id is null then raise exception 'applicationId and sessionId required'; end if;
  if p_actor_staff_id is null or p_actor_user_id is null then raise exception 'Authenticated Finance actor required'; end if;

  select upper(trim(coalesce(ou.role, sa.role, p_actor_role, ''))) into v_role
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
      on fr.id=ufr.role_id
     and fr.organization_id=ufr.organization_id
     and coalesce(fr.is_active,true)=true
    join public.finance_permissions fp
      on fp.organization_id=ufr.organization_id
     and fp.role_id=ufr.role_id
     and fp.permission_key='finance.close.execute'
    where ufr.organization_id=p_organization_id
      and ufr.user_id=p_actor_user_id
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

  if upper(coalesce(v_shift.accounting_status,'PENDING'))='CONFIRMED'
     and coalesce(v_shift.period_closed,false) then
    return jsonb_build_object('success',true,'duplicate',true,'session',to_jsonb(v_shift));
  end if;

  if upper(coalesce(v_shift.status,''))<>'CLOSED'
     or v_shift.reconciled_at is null
     or coalesce(v_shift.locked,false)=false then
    raise exception 'POS cash session must be reconciled and closed before accounting confirmation';
  end if;

  if upper(coalesce(v_shift.approval_status,'PENDING'))<>'APPROVED' then
    raise exception 'Manager approval is required before accounting confirmation';
  end if;

  if upper(coalesce(v_shift.accounting_status,'PENDING'))='BLOCKED' then
    raise exception 'POS cash session is blocked from accounting confirmation';
  end if;

  select round(coalesce(sum(p.amount),0)::numeric,2) into v_gross_total
  from public.payments p
  where p.organization_id=p_organization_id
    and p.entity_id=p_entity_id
    and lower(trim(coalesce(p.application_id,'')))=v_app
    and p.cash_session_id=p_session_id
    and upper(coalesce(p.status,'')) in ('PAID','COMPLETED');

  select round(coalesce(sum(c.amount),0)::numeric,2) into v_correction_total
  from public.pos_payment_corrections c
  where c.organization_id=p_organization_id
    and c.entity_id=p_entity_id
    and c.application_id=v_app
    and c.cash_session_id=p_session_id
    and upper(c.status)='POSTED';

  select
    round(coalesce(sum(case when upper(m.movement_type)='PAID_IN' then m.amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(m.movement_type)='PAID_OUT' then m.amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(m.movement_type)='ADJUSTMENT_IN' then m.amount else 0 end),0)::numeric,2),
    round(coalesce(sum(case when upper(m.movement_type)='ADJUSTMENT_OUT' then m.amount else 0 end),0)::numeric,2)
  into v_paid_in, v_paid_out, v_adjustment_in, v_adjustment_out
  from public.pos_cash_movements m
  where m.organization_id=p_organization_id
    and m.entity_id=p_entity_id
    and m.application_id=v_app
    and m.cash_session_id=p_session_id
    and upper(m.status)='POSTED';

  if abs(round((v_gross_total-v_correction_total)::numeric,2)-round(coalesce(v_shift.net_sales,0)::numeric,2))>0.01 then
    raise exception 'POS cash-session gross payments less corrections no longer match reconciled net sales';
  end if;

  if abs(v_correction_total-round((coalesce(v_shift.refund_total,0)+coalesce(v_shift.reversal_total,0))::numeric,2))>0.01 then
    raise exception 'POS cash-session correction totals no longer match the reconciled drawer';
  end if;

  if abs(v_paid_in-round(coalesce(v_shift.paid_in_total,0)::numeric,2))>0.01
     or abs(v_paid_out-round(coalesce(v_shift.paid_out_total,0)::numeric,2))>0.01
     or abs(v_adjustment_in-round(coalesce(v_shift.adjustment_in_total,0)::numeric,2))>0.01
     or abs(v_adjustment_out-round(coalesce(v_shift.adjustment_out_total,0)::numeric,2))>0.01 then
    raise exception 'POS cash movement totals no longer match the reconciled drawer';
  end if;

  if v_app='restaurant' then
    select count(*)::int into v_missing_payments
    from public.payments p
    where p.organization_id=p_organization_id
      and p.entity_id=p_entity_id
      and lower(trim(coalesce(p.application_id,'')))=v_app
      and p.cash_session_id=p_session_id
      and upper(coalesce(p.status,'')) in ('PAID','COMPLETED')
      and not exists (
        select 1
        from public.journal_entries j
        where j.organization_id=p_organization_id
          and j.entity_id=p_entity_id
          and j.source_module='pos'
          and j.source_document_id=p.id
          and j.source_document in (
            'POS_CASH_PAYMENT_RECEIVED',
            'POS_CARD_PAYMENT_RECEIVED',
            'POS_QR_PAYMENT_RECEIVED',
            'POS_TRANSFER_PAYMENT_RECEIVED'
          )
          and upper(coalesce(j.status,''))='POSTED'
      );
    if v_missing_payments>0 then
      raise exception 'Restaurant POS payment Finance posting is incomplete for % payment(s)',v_missing_payments;
    end if;

    select count(*)::int into v_missing_sales
    from (
      select distinct a.order_id
      from public.restaurant_payment_allocations a
      join public.payments p
        on p.id=a.payment_id
       and p.organization_id=a.organization_id
      where p.organization_id=p_organization_id
        and p.entity_id=p_entity_id
        and lower(trim(coalesce(p.application_id,'')))=v_app
        and p.cash_session_id=p_session_id
        and upper(coalesce(p.status,'')) in ('PAID','COMPLETED')
        and a.order_id is not null
    ) o
    where not exists (
      select 1
      from public.journal_entries j
      where j.organization_id=p_organization_id
        and j.entity_id=p_entity_id
        and j.source_module='pos'
        and j.source_document='POS_SALE_RECOGNIZED'
        and j.source_document_id=o.order_id
        and upper(coalesce(j.status,''))='POSTED'
    );
    if v_missing_sales>0 then
      raise exception 'Restaurant POS sale Finance posting is incomplete for % order(s)',v_missing_sales;
    end if;
  elsif v_app='retail' then
    select count(*)::int into v_missing_payments
    from public.payments p
    where p.organization_id=p_organization_id
      and p.entity_id=p_entity_id
      and lower(trim(coalesce(p.application_id,'')))=v_app
      and p.cash_session_id=p_session_id
      and upper(coalesce(p.status,'')) in ('PAID','COMPLETED')
      and (
        p.journal_entry_id is null
        or not exists (
          select 1
          from public.journal_entries j
          where j.id=p.journal_entry_id
            and j.organization_id=p_organization_id
            and j.entity_id=p_entity_id
            and j.source_module='commercial'
            and j.source_document='PAYMENT_RECEIVED'
            and j.source_document_id=p.id
            and upper(coalesce(j.status,''))='POSTED'
        )
      );
    if v_missing_payments>0 then
      raise exception 'Retail POS payment Finance posting is incomplete for % payment(s)',v_missing_payments;
    end if;
  else
    raise exception 'Accounting confirmation proof is not configured for POS application %',v_app;
  end if;

  select count(*)::int into v_missing_corrections
  from public.pos_payment_corrections c
  where c.organization_id=p_organization_id
    and c.entity_id=p_entity_id
    and c.application_id=v_app
    and c.cash_session_id=p_session_id
    and upper(c.status)='POSTED'
    and (
      not exists (
        select 1 from public.journal_entries j
        where j.id=c.payment_reversal_journal_id
          and j.organization_id=p_organization_id
          and j.entity_id=p_entity_id
          and upper(coalesce(j.status,''))='POSTED'
      )
      or not exists (
        select 1 from public.journal_entries j
        where j.id=c.sale_reversal_journal_id
          and j.organization_id=p_organization_id
          and j.entity_id=p_entity_id
          and upper(coalesce(j.status,''))='POSTED'
      )
      or not exists (
        select 1 from public.journal_entries j
        where j.id=c.original_payment_journal_id
          and j.organization_id=p_organization_id
          and j.entity_id=p_entity_id
          and coalesce(j.reversed,false)=true
          and j.reversal_journal_id=c.payment_reversal_journal_id
      )
      or not exists (
        select 1 from public.journal_entries j
        where j.id=c.original_sale_journal_id
          and j.organization_id=p_organization_id
          and j.entity_id=p_entity_id
          and coalesce(j.reversed,false)=true
          and j.reversal_journal_id=c.sale_reversal_journal_id
      )
    );
  if v_missing_corrections>0 then
    raise exception 'POS correction Finance posting is incomplete for % correction(s)',v_missing_corrections;
  end if;

  select count(*)::int into v_missing_movements
  from public.pos_cash_movements m
  where m.organization_id=p_organization_id
    and m.entity_id=p_entity_id
    and m.application_id=v_app
    and m.cash_session_id=p_session_id
    and upper(m.status)='POSTED'
    and not exists (
      select 1
      from public.journal_entries j
      where j.id=m.journal_entry_id
        and j.organization_id=p_organization_id
        and j.entity_id=p_entity_id
        and j.source_module='pos'
        and j.source_document_id=m.id
        and j.source_document='POS_CASH_'||upper(m.movement_type)
        and upper(coalesce(j.status,''))='POSTED'
    );
  if v_missing_movements>0 then
    raise exception 'POS cash movement Finance posting is incomplete for % movement(s)',v_missing_movements;
  end if;

  v_variance_journal_id := v_shift.variance_journal_entry_id;

  if abs(round(coalesce(v_shift.variance,0)::numeric,2))>0.01
     and v_variance_journal_id is null then
    v_variance_posting := public.finance_post_pos_cash_variance_atomic(
      p_organization_id,
      p_entity_id,
      p_session_id,
      v_shift.variance,
      p_actor_staff_id,
      coalesce(nullif(trim(coalesce(p_notes,'')),''),'POS cash-session variance recognition'),
      'pos-cash-variance:'||p_session_id::text
    );
    v_variance_journal_id := nullif(v_variance_posting->>'journal_entry_id','')::uuid;
    if v_variance_journal_id is null then
      raise exception 'POS cash-session variance posting is incomplete';
    end if;
  elsif v_variance_journal_id is not null then
    perform 1
    from public.journal_entries j
    where j.id=v_variance_journal_id
      and j.organization_id=p_organization_id
      and j.entity_id=p_entity_id
      and upper(coalesce(j.status,''))='POSTED';
    if not found then
      raise exception 'POS cash-session variance journal is missing or not posted';
    end if;
  end if;

  update public.pos_shifts
  set accounting_status='CONFIRMED',
      accounting_confirmed_by=p_actor_staff_id,
      accounting_confirmed_at=now(),
      accounting_notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),accounting_notes),
      variance_journal_entry_id=v_variance_journal_id,
      variance_posted_at=case
        when v_variance_journal_id is not null then coalesce(variance_posted_at,now())
        else variance_posted_at
      end,
      period_closed=true,
      updated_at=now()
  where id=p_session_id
  returning * into v_shift;

  insert into public.approval_logs(
    organization_id,
    entity_type,
    entity_id,
    from_status,
    to_status,
    acted_by,
    role,
    notes,
    created_at
  ) values (
    p_organization_id,
    'pos_cash_session_accounting',
    p_session_id,
    'PENDING',
    'CONFIRMED',
    p_actor_staff_id,
    v_finance_role,
    nullif(trim(coalesce(p_notes,'')),''),
    now()
  );

  return jsonb_build_object(
    'success',true,
    'duplicate',false,
    'posting_evidence',jsonb_build_object(
      'application_id',v_app,
      'gross_settled_total',v_gross_total,
      'correction_total',v_correction_total,
      'net_settled_total',round((v_gross_total-v_correction_total)::numeric,2),
      'paid_in_total',v_paid_in,
      'paid_out_total',v_paid_out,
      'adjustment_in_total',v_adjustment_in,
      'adjustment_out_total',v_adjustment_out,
      'missing_payment_journals',v_missing_payments,
      'missing_sale_journals',v_missing_sales,
      'missing_correction_journals',v_missing_corrections,
      'missing_movement_journals',v_missing_movements,
      'variance_journal_entry_id',v_variance_journal_id
    ),
    'session',to_jsonb(v_shift)
  );
end;
$$;

revoke all on function public.pos_confirm_cash_session_accounting_atomic(uuid,uuid,text,uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.pos_confirm_cash_session_accounting_atomic(uuid,uuid,text,uuid,uuid,uuid,text,text)
  to service_role;

commit;
