begin;

create or replace function public.workforce_create_clock_in_exception_request(
  p_organization_id uuid,
  p_staff_id uuid,
  p_reason text,
  p_targets text[],
  p_failure_code text default null
)
returns table (
  request_id uuid,
  reference_id uuid,
  created boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_targets text[];
  v_existing_id uuid;
  v_existing_reference_id uuid;
  v_request_id uuid := gen_random_uuid();
  v_reference_id uuid := gen_random_uuid();
  v_metadata jsonb;
begin
  if p_organization_id is null or p_staff_id is null then
    raise exception 'CLOCK_IN_EXCEPTION_CONTEXT_REQUIRED' using errcode = '22023';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'CLOCK_IN_EXCEPTION_REASON_INVALID' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct normalized order by normalized), '{}'::text[])
  into v_targets
  from (
    select lower(btrim(value)) as normalized
    from unnest(coalesce(p_targets, '{}'::text[])) as target(value)
    where btrim(coalesce(value, '')) <> ''
  ) normalized_targets;

  if cardinality(v_targets) = 0 then
    raise exception 'CLOCK_IN_EXCEPTION_TARGETS_REQUIRED' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_targets) as target(value)
    where value not in ('passkey', 'gps')
  ) then
    raise exception 'CLOCK_IN_EXCEPTION_TARGET_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_staff_id::text || ':workforce_clock_in_exception',
      0
    )
  );

  update public.approval_requests
  set status = 'expired'
  where organization_id = p_organization_id
    and requested_by = p_staff_id
    and reference_table = 'workforce_clock_in_exception'
    and status = 'approved'
    and approved_at is not null
    and approved_at < now() - interval '10 minutes';

  select ar.id, ar.reference_id
  into v_existing_id, v_existing_reference_id
  from public.approval_requests ar
  join lateral (
    select al.notes::jsonb as metadata
    from public.approval_logs al
    where al.organization_id = ar.organization_id
      and al.entity_type = 'workforce_clock_in_exception'
      and al.entity_id = ar.reference_id
      and al.to_status = 'pending'
    order by al.created_at asc, al.id asc
    limit 1
  ) initial_log on true
  where ar.organization_id = p_organization_id
    and ar.requested_by = p_staff_id
    and ar.reference_table = 'workforce_clock_in_exception'
    and ar.status in ('pending', 'approved', 'consuming')
    and exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(initial_log.metadata -> 'targets', '[]'::jsonb)
      ) as existing_target(value)
      where lower(existing_target.value) = any(v_targets)
    )
  order by ar.created_at desc, ar.id desc
  limit 1;

  if v_existing_id is not null then
    request_id := v_existing_id;
    reference_id := v_existing_reference_id;
    created := false;
    return next;
    return;
  end if;

  v_metadata := jsonb_build_object(
    'reason', v_reason,
    'targets', to_jsonb(v_targets)
  );

  if nullif(btrim(coalesce(p_failure_code, '')), '') is not null then
    v_metadata := v_metadata || jsonb_build_object(
      'failureCode', left(btrim(p_failure_code), 120)
    );
  end if;

  insert into public.approval_requests (
    id,
    organization_id,
    workflow_id,
    requested_by,
    type,
    reference_id,
    reference_table,
    status,
    required_role
  )
  values (
    v_request_id,
    p_organization_id,
    null,
    p_staff_id,
    'WORKFORCE_CLOCK_IN_EXCEPTION',
    v_reference_id,
    'workforce_clock_in_exception',
    'pending',
    'manager'
  );

  insert into public.approval_logs (
    organization_id,
    entity_type,
    entity_id,
    from_status,
    to_status,
    acted_by,
    acted_role,
    notes
  )
  values (
    p_organization_id,
    'workforce_clock_in_exception',
    v_reference_id,
    null,
    'pending',
    p_staff_id,
    'staff',
    v_metadata::text
  );

  request_id := v_request_id;
  reference_id := v_reference_id;
  created := true;
  return next;
end;
$$;

create or replace function public.workforce_consume_clock_in_exception_claims(
  p_organization_id uuid,
  p_staff_id uuid,
  p_request_ids uuid[],
  p_shift_id uuid,
  p_acted_role text default 'staff'
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request_ids uuid[];
  v_expected integer;
  v_updated integer;
  v_logged integer;
  v_acted_role text := coalesce(nullif(btrim(p_acted_role), ''), 'staff');
begin
  if p_organization_id is null or p_staff_id is null or p_shift_id is null then
    raise exception 'CLOCK_IN_EXCEPTION_CONSUME_CONTEXT_REQUIRED' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[])
  into v_request_ids
  from unnest(coalesce(p_request_ids, '{}'::uuid[])) as request_id(value)
  where value is not null;

  v_expected := cardinality(v_request_ids);

  if v_expected = 0 then
    return 0;
  end if;

  with updated as (
    update public.approval_requests
    set status = 'consumed'
    where organization_id = p_organization_id
      and requested_by = p_staff_id
      and reference_table = 'workforce_clock_in_exception'
      and status = 'consuming'
      and id = any(v_request_ids)
    returning id, reference_id
  ),
  logged as (
    insert into public.approval_logs (
      organization_id,
      entity_type,
      entity_id,
      from_status,
      to_status,
      acted_by,
      acted_role,
      notes
    )
    select
      p_organization_id,
      'workforce_clock_in_exception',
      updated.reference_id,
      'consuming',
      'consumed',
      p_staff_id,
      v_acted_role,
      jsonb_build_object('shiftId', p_shift_id)::text
    from updated
    returning id
  )
  select
    (select count(*) from updated),
    (select count(*) from logged)
  into v_updated, v_logged;

  if v_updated <> v_expected or v_logged <> v_expected then
    raise exception 'CLOCK_IN_EXCEPTION_ALREADY_USED' using errcode = '40001';
  end if;

  return v_updated;
end;
$$;

revoke all on function public.workforce_create_clock_in_exception_request(uuid, uuid, text, text[], text) from public;
revoke all on function public.workforce_create_clock_in_exception_request(uuid, uuid, text, text[], text) from anon, authenticated;
grant execute on function public.workforce_create_clock_in_exception_request(uuid, uuid, text, text[], text) to service_role;

revoke all on function public.workforce_consume_clock_in_exception_claims(uuid, uuid, uuid[], uuid, text) from public;
revoke all on function public.workforce_consume_clock_in_exception_claims(uuid, uuid, uuid[], uuid, text) from anon, authenticated;
grant execute on function public.workforce_consume_clock_in_exception_claims(uuid, uuid, uuid[], uuid, text) to service_role;

comment on function public.workforce_create_clock_in_exception_request(uuid, uuid, text, text[], text)
is 'Atomically creates or reuses an overlapping Workforce clock-in exception request under a per-staff advisory transaction lock.';

comment on function public.workforce_consume_clock_in_exception_claims(uuid, uuid, uuid[], uuid, text)
is 'Atomically consumes claimed Workforce clock-in exception grants and writes their audit logs in the same transaction.';

commit;
