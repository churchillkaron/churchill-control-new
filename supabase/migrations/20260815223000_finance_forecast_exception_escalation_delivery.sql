create table if not exists public.finance_forecast_exception_escalation_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.finance_forecast_exception_cases(id) on delete cascade,
  escalation_revision bigint not null,
  escalation_level text not null,
  escalation_reason text,
  recipient_user_id uuid not null,
  recipient_kind text not null,
  notification_id uuid references public.enterprise_notifications(id) on delete set null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint finance_forecast_exception_escalation_deliveries_level_check
    check (escalation_level in ('ATTENTION', 'ESCALATED', 'CRITICAL')),
  constraint finance_forecast_exception_escalation_deliveries_recipient_kind_check
    check (recipient_kind in ('ASSIGNEE', 'FINANCE_MANAGER')),
  constraint finance_forecast_exception_escalation_deliveries_unique
    unique (case_id, escalation_revision, recipient_user_id)
);

create index if not exists finance_forecast_exception_escalation_deliveries_org_idx
  on public.finance_forecast_exception_escalation_deliveries (
    organization_id,
    delivered_at desc,
    created_at desc
  );

create index if not exists finance_forecast_exception_escalation_deliveries_case_idx
  on public.finance_forecast_exception_escalation_deliveries (
    case_id,
    escalation_revision desc,
    created_at desc
  );

alter table public.finance_forecast_exception_escalation_deliveries enable row level security;

revoke all on table public.finance_forecast_exception_escalation_deliveries
  from anon, authenticated;

grant select, insert, update, delete on table public.finance_forecast_exception_escalation_deliveries
  to service_role;

create or replace function public.finance_deliver_forecast_exception_escalation(
  p_organization_id uuid,
  p_case_id uuid,
  p_escalation_revision bigint,
  p_recipient_user_id uuid,
  p_recipient_kind text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_case public.finance_forecast_exception_cases%rowtype;
  v_delivery public.finance_forecast_exception_escalation_deliveries%rowtype;
  v_recipient_kind text := upper(trim(coalesce(p_recipient_kind, '')));
  v_recipient_active boolean := false;
  v_recipient_allowed boolean := false;
  v_notification_id uuid;
  v_title text;
  v_message text;
  v_severity text;
  v_target_role text;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;
  if p_case_id is null then
    raise exception 'case_id required';
  end if;
  if p_escalation_revision is null then
    raise exception 'escalation_revision required';
  end if;
  if p_recipient_user_id is null then
    raise exception 'recipient_user_id required';
  end if;
  if v_recipient_kind not in ('ASSIGNEE', 'FINANCE_MANAGER') then
    raise exception 'Invalid forecast escalation recipient kind';
  end if;

  select *
    into v_case
    from public.finance_forecast_exception_cases
   where id = p_case_id
     and organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'Forecast exception case not found';
  end if;
  if v_case.status = 'RESOLVED' or v_case.escalation_level = 'NONE' then
    raise exception 'Forecast exception escalation is no longer active';
  end if;
  if v_case.escalation_revision <> p_escalation_revision then
    raise exception 'Stale forecast exception escalation revision';
  end if;

  select exists (
    select 1
      from public.staff_accounts sa
     where coalesce(sa.active, true) = true
       and coalesce(sa.auth_user_id, sa.user_id) = p_recipient_user_id
       and (
         sa.active_organization_id = p_organization_id
         or exists (
           select 1
             from public.organization_users ou
            where ou.organization_id = p_organization_id
              and ou.staff_account_id = sa.id
              and upper(coalesce(ou.status, 'ACTIVE')) not in (
                'INACTIVE', 'DISABLED', 'SUSPENDED', 'TERMINATED',
                'ARCHIVED', 'REVOKED'
              )
         )
       )
  ) into v_recipient_active;

  if not v_recipient_active then
    raise exception 'Invalid or inactive forecast escalation recipient';
  end if;

  if v_recipient_kind = 'ASSIGNEE' then
    v_recipient_allowed := v_case.assigned_to = p_recipient_user_id;
  else
    select (
      exists (
        select 1
          from public.user_finance_roles ufr
          join public.finance_permissions fp
            on fp.organization_id = ufr.organization_id
           and fp.role_id = ufr.role_id
           and fp.permission_key = 'finance.accounting.manage'
         where ufr.organization_id = p_organization_id
           and ufr.user_id = p_recipient_user_id::text
      )
      or exists (
        select 1
          from public.organization_users ou
          join public.staff_accounts sa on sa.id = ou.staff_account_id
         where ou.organization_id = p_organization_id
           and coalesce(sa.auth_user_id, sa.user_id) = p_recipient_user_id
           and coalesce(sa.active, true) = true
           and upper(coalesce(ou.status, 'ACTIVE')) not in (
             'INACTIVE', 'DISABLED', 'SUSPENDED', 'TERMINATED',
             'ARCHIVED', 'REVOKED'
           )
           and upper(coalesce(ou.role, sa.role, '')) in (
             'OWNER', 'ORGANIZATION_OWNER', 'ORG_OWNER'
           )
      )
    ) into v_recipient_allowed;
  end if;

  if not v_recipient_allowed then
    raise exception 'Forecast escalation recipient is not authorized for this delivery';
  end if;

  select *
    into v_delivery
    from public.finance_forecast_exception_escalation_deliveries
   where case_id = v_case.id
     and escalation_revision = v_case.escalation_revision
     and recipient_user_id = p_recipient_user_id;

  if found then
    return jsonb_build_object(
      'success', true,
      'delivered', false,
      'idempotent', true,
      'delivery_id', v_delivery.id,
      'notification_id', v_delivery.notification_id,
      'delivered_at', v_delivery.delivered_at
    );
  end if;

  insert into public.finance_forecast_exception_escalation_deliveries (
    organization_id,
    case_id,
    escalation_revision,
    escalation_level,
    escalation_reason,
    recipient_user_id,
    recipient_kind
  ) values (
    p_organization_id,
    v_case.id,
    v_case.escalation_revision,
    v_case.escalation_level,
    v_case.escalation_reason,
    p_recipient_user_id,
    v_recipient_kind
  )
  returning * into v_delivery;

  v_title := case v_case.escalation_level
    when 'CRITICAL' then 'Critical forecast exception escalation'
    when 'ESCALATED' then 'Forecast exception escalated'
    else 'Forecast exception requires attention'
  end;

  v_message := case v_case.escalation_reason
    when 'OVERDUE_UNASSIGNED' then v_case.exception_title || ' is overdue and has no assigned Finance owner.'
    when 'OVERDUE' then v_case.exception_title || ' is overdue and requires action by the assigned owner.'
    when 'UNASSIGNED_DUE_TODAY' then v_case.exception_title || ' is due today and has no assigned Finance owner.'
    when 'UNASSIGNED' then v_case.exception_title || ' requires an assigned Finance owner.'
    when 'DUE_TODAY' then v_case.exception_title || ' is due today.'
    else v_case.exception_title || ' requires Finance management attention.'
  end;

  if v_case.due_date is not null then
    v_message := v_message || ' Due date: ' || v_case.due_date::text || '.';
  end if;

  v_severity := case v_case.escalation_level
    when 'CRITICAL' then 'critical'
    when 'ESCALATED' then 'warning'
    else 'warning'
  end;

  v_target_role := case v_recipient_kind
    when 'FINANCE_MANAGER' then 'FINANCE_MANAGER'
    else 'FINANCE_ASSIGNEE'
  end;

  insert into public.enterprise_notifications (
    notification_type,
    category,
    title,
    message,
    severity,
    target_role,
    target_user_id,
    read,
    organization_id
  ) values (
    'FORECAST_EXCEPTION_ESCALATION',
    'finance',
    v_title,
    v_message,
    v_severity,
    v_target_role,
    p_recipient_user_id,
    false,
    p_organization_id
  )
  returning id into v_notification_id;

  update public.finance_forecast_exception_escalation_deliveries
     set notification_id = v_notification_id,
         delivered_at = now()
   where id = v_delivery.id
  returning * into v_delivery;

  insert into public.audit_logs (
    entity_type,
    entity_id,
    action_type,
    performed_by,
    performed_by_name,
    old_data,
    new_data,
    metadata,
    organization_id,
    created_at
  ) values (
    'forecast_exception_case',
    v_case.id,
    'FORECAST_EXCEPTION_ESCALATION_DELIVERED',
    null,
    'Forecast Escalation Delivery',
    null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'notification_id', v_notification_id,
      'escalation_revision', v_case.escalation_revision,
      'escalation_level', v_case.escalation_level,
      'recipient_user_id', p_recipient_user_id,
      'recipient_kind', v_recipient_kind,
      'delivered_at', v_delivery.delivered_at
    ),
    jsonb_build_object(
      'module', 'finance',
      'subsystem', 'forecasting',
      'automation_source', 'forecast_exception_escalation_delivery',
      'legal_entity_id', v_case.entity_id,
      'exception_type', v_case.exception_type,
      'occurrence_key', v_case.occurrence_key,
      'escalation_reason', v_case.escalation_reason
    ),
    p_organization_id,
    now()
  );

  return jsonb_build_object(
    'success', true,
    'delivered', true,
    'idempotent', false,
    'delivery_id', v_delivery.id,
    'notification_id', v_notification_id,
    'delivered_at', v_delivery.delivered_at
  );
end;
$$;

revoke execute on function public.finance_deliver_forecast_exception_escalation(
  uuid, uuid, bigint, uuid, text
) from public, anon, authenticated;

grant execute on function public.finance_deliver_forecast_exception_escalation(
  uuid, uuid, bigint, uuid, text
) to service_role;
