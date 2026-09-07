-- Governed Hotel business-day reopen.
-- Reopen is deliberately limited to the property's current governed business date. Historical
-- closed days remain immutable and must be corrected through adjustment evidence rather than
-- reopening old operational source truth.

create table if not exists public.hotel_business_day_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  night_audit_id uuid not null,
  business_date date not null,
  action text not null,
  reason text not null,
  prior_status text not null,
  prior_control_summary jsonb not null default '{}'::jsonb,
  prior_closed_at timestamptz,
  performed_by_staff_account_id uuid,
  performed_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hotel_business_day_corrections_scope_idx
  on public.hotel_business_day_corrections(organization_id, property_id, business_date, performed_at desc);

alter table public.hotel_business_day_corrections enable row level security;
revoke all on table public.hotel_business_day_corrections from public, anon, authenticated;
grant select, insert on table public.hotel_business_day_corrections to service_role;

create or replace function public.hotel_reopen_business_day_guarded(
  p_organization_id uuid,
  p_property_id uuid,
  p_business_date date,
  p_reason text,
  p_performed_by_staff_account_id uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_current_business_date date;
  v_audit public.hotel_night_audits%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_correction public.hotel_business_day_corrections%rowtype;
  v_now timestamptz := now();
begin
  if p_organization_id is null or p_property_id is null or p_business_date is null then
    raise exception 'HOTEL_DAY_REOPEN: organization, property and business date are required';
  end if;
  if v_reason is null or length(v_reason) < 8 then
    raise exception 'HOTEL_DAY_REOPEN: a specific correction reason is required';
  end if;

  v_current_business_date := public.hotel_current_business_date_guarded(
    p_organization_id,
    p_property_id,
    v_now
  );
  if v_current_business_date is distinct from p_business_date then
    raise exception 'HOTEL_DAY_REOPEN_HISTORICAL_FORBIDDEN: only the current property business day can be reopened';
  end if;

  perform public.hotel_lock_business_day(p_organization_id, p_property_id, p_business_date);

  v_current_business_date := public.hotel_current_business_date_guarded(
    p_organization_id,
    p_property_id,
    v_now
  );
  if v_current_business_date is distinct from p_business_date then
    raise exception 'HOTEL_DAY_REOPEN_DATE_CHANGED: property business date changed while reopen was waiting for authority';
  end if;

  select * into v_audit
  from public.hotel_night_audits a
  where a.organization_id = p_organization_id
    and a.property_id = p_property_id
    and a.business_date = p_business_date
  for update;

  if not found then
    raise exception 'HOTEL_DAY_REOPEN: closed audit not found';
  end if;
  if upper(coalesce(v_audit.status, '')) = 'REOPENED' then
    return jsonb_build_object(
      'audit', to_jsonb(v_audit),
      'already_reopened', true,
      'business_date', p_business_date
    );
  end if;
  if upper(coalesce(v_audit.status, '')) <> 'CLOSED' then
    raise exception 'HOTEL_DAY_REOPEN: business day is not closed';
  end if;

  insert into public.hotel_business_day_corrections (
    organization_id,
    property_id,
    night_audit_id,
    business_date,
    action,
    reason,
    prior_status,
    prior_control_summary,
    prior_closed_at,
    performed_by_staff_account_id,
    performed_at,
    evidence
  ) values (
    p_organization_id,
    p_property_id,
    v_audit.id,
    p_business_date,
    'REOPEN',
    v_reason,
    coalesce(v_audit.status, 'CLOSED'),
    coalesce(v_audit.control_summary, '{}'::jsonb),
    v_audit.closed_at,
    p_performed_by_staff_account_id,
    v_now,
    jsonb_build_object(
      'reopened_under_business_day_lock', true,
      'historical_reopen_forbidden', true,
      'previous_close_preserved', true
    )
  )
  returning * into v_correction;

  update public.hotel_night_audits
  set status = 'REOPENED',
      control_summary = coalesce(control_summary, '{}'::jsonb) || jsonb_build_object(
        'reopen', jsonb_build_object(
          'correction_id', v_correction.id,
          'reason', v_reason,
          'performed_by_staff_account_id', p_performed_by_staff_account_id,
          'performed_at', v_now,
          'previous_closed_at', v_audit.closed_at
        )
      ),
      updated_at = v_now
  where id = v_audit.id;

  select * into v_audit
  from public.hotel_night_audits
  where id = v_audit.id;

  return jsonb_build_object(
    'audit', to_jsonb(v_audit),
    'correction', to_jsonb(v_correction),
    'already_reopened', false,
    'business_date', p_business_date
  );
end;
$function$;

revoke all on function public.hotel_reopen_business_day_guarded(uuid,uuid,date,text,uuid) from public;
revoke all on function public.hotel_reopen_business_day_guarded(uuid,uuid,date,text,uuid) from anon;
revoke all on function public.hotel_reopen_business_day_guarded(uuid,uuid,date,text,uuid) from authenticated;
grant execute on function public.hotel_reopen_business_day_guarded(uuid,uuid,date,text,uuid) to service_role;
