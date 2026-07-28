begin;

create or replace function public.finance_validate_accounting_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text;
  v_overlap boolean;
begin
  if new.organization_id is null then
    raise exception 'organization_id required';
  end if;

  new.setting_key := upper(btrim(coalesce(new.setting_key, '')));
  new.status := upper(btrim(coalesce(new.status, 'ACTIVE')));

  if new.setting_key not in (
    'POSTING_DATE_BASIS',
    'SYSTEM_JOURNAL_TYPE',
    'JOURNAL_REFERENCE_FORMAT'
  ) then
    raise exception 'Unsupported Finance accounting policy %', new.setting_key;
  end if;

  if new.value_json is null or jsonb_typeof(new.value_json) <> 'object' then
    raise exception 'value_json must be an object';
  end if;

  v_value := upper(btrim(coalesce(new.value_json ->> 'value', '')));

  if v_value = '' then
    raise exception 'Accounting policy value required';
  end if;

  if new.setting_key = 'POSTING_DATE_BASIS' then
    if v_value not in ('TRANSACTION_DATE', 'DOCUMENT_DATE', 'EVENT_DATE') then
      raise exception 'Unsupported Posting Date Basis value %', v_value;
    end if;
    new.name := 'Posting Date Basis';
  elsif new.setting_key = 'SYSTEM_JOURNAL_TYPE' then
    if v_value not in ('SYSTEM', 'GENERAL', 'ADJUSTING') then
      raise exception 'Unsupported System Journal Type value %', v_value;
    end if;
    new.name := 'System Journal Type';
  elsif new.setting_key = 'JOURNAL_REFERENCE_FORMAT' then
    if v_value not in ('SOURCE_DOCUMENT', 'EVENT_ID', 'SOURCE_AND_EVENT') then
      raise exception 'Unsupported Journal Reference Format value %', v_value;
    end if;
    new.name := 'Journal Reference Format';
  end if;

  new.value_json := jsonb_build_object('value', v_value);

  if new.effective_from is null then
    raise exception 'effective_from required';
  end if;

  if new.effective_to is not null and new.effective_to < new.effective_from then
    raise exception 'effective_to cannot be before effective_from';
  end if;

  if new.status not in ('ACTIVE', 'ARCHIVED') then
    raise exception 'Unsupported accounting setting status %', new.status;
  end if;

  if new.status = 'ACTIVE' then
    select exists (
      select 1
      from public.finance_accounting_settings existing
      where existing.organization_id = new.organization_id
        and upper(btrim(existing.setting_key)) = new.setting_key
        and upper(coalesce(existing.status, 'ACTIVE')) = 'ACTIVE'
        and existing.id is distinct from new.id
        and new.effective_from <= coalesce(existing.effective_to, 'infinity'::date)
        and existing.effective_from <= coalesce(new.effective_to, 'infinity'::date)
    ) into v_overlap;

    if v_overlap then
      raise exception 'An active overlapping version already exists for accounting policy %', new.setting_key;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists finance_accounting_settings_validate_trigger
  on public.finance_accounting_settings;

create trigger finance_accounting_settings_validate_trigger
before insert or update on public.finance_accounting_settings
for each row
execute function public.finance_validate_accounting_setting();

create index if not exists finance_accounting_settings_resolution_idx
on public.finance_accounting_settings (
  organization_id,
  setting_key,
  status,
  effective_from desc,
  effective_to
);

notify pgrst, 'reload schema';

commit;
