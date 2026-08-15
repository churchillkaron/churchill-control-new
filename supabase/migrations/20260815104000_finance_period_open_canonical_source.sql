begin;

create or replace function public.is_period_open(
  p_date date,
  p_entity_id uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_canonical_exists boolean := false;
  v_canonical_open boolean := false;
  v_legacy_open boolean := false;
begin
  if p_date is null or p_entity_id is null then
    return false;
  end if;

  select
    true,
    lower(coalesce(ap.status, '')) = 'open'
      and ap.closed_at is null
      and ap.locked_at is null
  into v_canonical_exists, v_canonical_open
  from public.accounting_periods ap
  where coalesce(ap.entity_id, ap.legal_entity_id) = p_entity_id
    and p_date between ap.start_date and ap.end_date
  order by ap.start_date desc, ap.created_at desc
  limit 1;

  if coalesce(v_canonical_exists, false) then
    return coalesce(v_canonical_open, false);
  end if;

  select exists (
    select 1
    from public.financial_periods fp
    where fp.entity_id = p_entity_id
      and p_date between fp.start_date and fp.end_date
      and lower(coalesce(fp.status, '')) = 'open'
  )
  into v_legacy_open;

  return coalesce(v_legacy_open, false);
end;
$$;

commit;
