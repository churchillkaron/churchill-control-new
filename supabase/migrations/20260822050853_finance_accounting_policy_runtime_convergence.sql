create or replace function public.finance_validate_accounting_setting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_value text;
  v_overlap boolean;
begin
  if new.organization_id is null then
    raise exception 'organization_id required';
  end if;

  v_key := upper(btrim(coalesce(new.setting_key, '')));

  if v_key = '' then
    new.setting_key := null;
    new.updated_at := now();
    return new;
  end if;

  new.setting_key := v_key;
  new.status := upper(btrim(coalesce(new.status, 'ACTIVE')));

  if new.value_json is null or jsonb_typeof(new.value_json) <> 'object' then
    raise exception 'value_json must be an object';
  end if;

  v_value := upper(btrim(coalesce(new.value_json ->> 'value', '')));
  if v_value = '' then
    raise exception 'Accounting policy value required';
  end if;

  case new.setting_key
    when 'POSTING_DATE_BASIS' then
      if v_value not in ('TRANSACTION_DATE', 'DOCUMENT_DATE', 'EVENT_DATE') then raise exception 'Unsupported Posting Date Basis value %', v_value; end if;
      new.name := 'Posting Date Basis';
    when 'SYSTEM_JOURNAL_TYPE' then
      if v_value not in ('SYSTEM', 'GENERAL', 'ADJUSTING') then raise exception 'Unsupported System Journal Type value %', v_value; end if;
      new.name := 'System Journal Type';
    when 'JOURNAL_REFERENCE_FORMAT' then
      if v_value not in ('SOURCE_DOCUMENT', 'EVENT_ID', 'SOURCE_AND_EVENT') then raise exception 'Unsupported Journal Reference Format value %', v_value; end if;
      new.name := 'Journal Reference Format';
    when 'COST_CENTER_CODE_MODE' then
      if v_value not in ('MANUAL', 'AUTO_FROM_NAME') then raise exception 'Unsupported Cost Centre Code Mode value %', v_value; end if;
      new.name := 'Cost Centre Code Mode';
    when 'COST_CENTER_DEPARTMENT_MODE' then
      if v_value not in ('REQUIRED', 'OPTIONAL', 'HIDDEN') then raise exception 'Unsupported Cost Centre Department Usage value %', v_value; end if;
      new.name := 'Cost Centre Department Usage';
    when 'COST_CENTER_OWNER_MODE' then
      if v_value not in ('REQUIRED', 'OPTIONAL', 'HIDDEN') then raise exception 'Unsupported Cost Centre Responsible Owner Usage value %', v_value; end if;
      new.name := 'Cost Centre Responsible Owner Usage';
    when 'COST_CENTER_TYPE_MODE' then
      if v_value not in ('REQUIRED', 'OPTIONAL', 'HIDDEN') then raise exception 'Unsupported Cost Centre Type Usage value %', v_value; end if;
      new.name := 'Cost Centre Type Usage';
    when 'COST_CENTER_DEFAULT_TYPE' then
      if v_value not in ('OPERATIONAL', 'ADMINISTRATIVE', 'SALES', 'SERVICE', 'PROJECT', 'SHARED_SERVICE', 'OTHER') then raise exception 'Unsupported Default Cost Centre Type value %', v_value; end if;
      new.name := 'Default Cost Centre Type';
    when 'COST_CENTER_HIERARCHY_MODE' then
      if v_value not in ('REQUIRED', 'OPTIONAL', 'DISABLED') then raise exception 'Unsupported Cost Centre Hierarchy Usage value %', v_value; end if;
      new.name := 'Cost Centre Hierarchy Usage';
    when 'COST_CENTER_DESCRIPTION_MODE' then
      if v_value not in ('ENABLED', 'DISABLED') then raise exception 'Unsupported Cost Centre Description Usage value %', v_value; end if;
      new.name := 'Cost Centre Description Usage';
    else
      raise exception 'Unsupported Finance accounting policy %', new.setting_key;
  end case;

  new.value_json := jsonb_build_object('value', v_value);

  if new.effective_from is null then raise exception 'effective_from required'; end if;
  if new.effective_to is not null and new.effective_to < new.effective_from then raise exception 'effective_to cannot be before effective_from'; end if;
  if new.status not in ('ACTIVE', 'ARCHIVED') then raise exception 'Unsupported accounting setting status %', new.status; end if;

  if new.status = 'ACTIVE' then
    select exists (
      select 1
      from public.finance_accounting_settings existing
      where existing.organization_id = new.organization_id
        and upper(btrim(coalesce(existing.setting_key, ''))) = new.setting_key
        and upper(coalesce(existing.status, 'ACTIVE')) = 'ACTIVE'
        and existing.id is distinct from new.id
        and new.effective_from <= coalesce(existing.effective_to, 'infinity'::date)
        and existing.effective_from <= coalesce(new.effective_to, 'infinity'::date)
    ) into v_overlap;
    if v_overlap then raise exception 'An active overlapping version already exists for accounting policy %', new.setting_key; end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.finance_validate_accounting_setting() from public, anon, authenticated;
grant execute on function public.finance_validate_accounting_setting() to service_role;