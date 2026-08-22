begin;

create or replace function public.finance_validate_recurring_journal_template()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
begin
  new.name := btrim(coalesce(new.name, ''));
  new.reference := nullif(btrim(coalesce(new.reference, '')), '');
  new.frequency := upper(btrim(coalesce(new.frequency, '')));
  new.currency_code := upper(btrim(coalesce(new.currency_code, '')));
  new.timezone := btrim(coalesce(new.timezone, ''));

  if new.name = '' then raise exception 'Recurring Journal Template Name required'; end if;
  if new.organization_id is null then raise exception 'organization_id required'; end if;
  if new.entity_id is null then raise exception 'entity_id required'; end if;
  if new.frequency not in ('DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY') then
    raise exception 'Recurring Journal frequency is not supported';
  end if;
  if new.next_run_date is null then raise exception 'Recurring Journal Next Run Date required'; end if;
  if new.end_date is not null and new.end_date < new.next_run_date then
    raise exception 'Recurring Journal End Date cannot be before Next Run Date';
  end if;
  if new.currency_code = '' then raise exception 'Recurring Journal Currency required'; end if;
  if new.exchange_rate is null or new.exchange_rate <= 0 then
    raise exception 'Recurring Journal Exchange Rate must be greater than zero';
  end if;
  if new.timezone = '' then raise exception 'Recurring Journal timezone required'; end if;
  if new.lines is null or jsonb_typeof(new.lines) <> 'array' or jsonb_array_length(new.lines) < 2 then
    raise exception 'Recurring Journal requires at least two lines';
  end if;

  perform 1 from public.legal_entities
  where id = new.entity_id and organization_id = new.organization_id;
  if not found then raise exception 'Recurring Journal Legal Entity not found in organisation'; end if;

  for v_line in select value from jsonb_array_elements(new.lines)
  loop
    begin
      v_account_id := nullif(btrim(v_line->>'account_id'), '')::uuid;
    exception when others then
      raise exception 'Recurring Journal line has invalid Account';
    end;
    if v_account_id is null then raise exception 'Recurring Journal line Account required'; end if;

    perform 1 from public.chart_of_accounts
    where id = v_account_id
      and organization_id = new.organization_id
      and entity_id = new.entity_id
      and coalesce(is_active, active, true) = true
      and upper(coalesce(status, 'ACTIVE')) not in ('INACTIVE','ARCHIVED','CLOSED');
    if not found then raise exception 'Recurring Journal line Account is outside selected Legal Entity or inactive'; end if;

    begin
      v_debit := coalesce(nullif(btrim(v_line->>'debit'), '')::numeric, 0);
      v_credit := coalesce(nullif(btrim(v_line->>'credit'), '')::numeric, 0);
    exception when others then
      raise exception 'Recurring Journal line Debit/Credit must be numeric';
    end;

    if v_debit < 0 or v_credit < 0 then raise exception 'Recurring Journal amounts cannot be negative'; end if;
    if (v_debit > 0 and v_credit > 0) or (v_debit = 0 and v_credit = 0) then
      raise exception 'Recurring Journal line must contain either Debit or Credit';
    end if;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  end loop;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'Recurring Journal is unbalanced: debit % credit %', round(v_total_debit,2), round(v_total_credit,2);
  end if;
  if round(v_total_debit, 2) <= 0 then raise exception 'Recurring Journal total must be greater than zero'; end if;

  return new;
end;
$$;

drop trigger if exists finance_recurring_journal_template_validate on public.finance_recurring_journal_templates;
create trigger finance_recurring_journal_template_validate
before insert or update on public.finance_recurring_journal_templates
for each row execute function public.finance_validate_recurring_journal_template();

revoke all on function public.finance_validate_recurring_journal_template() from public;
revoke all on function public.finance_validate_recurring_journal_template() from anon;
revoke all on function public.finance_validate_recurring_journal_template() from authenticated;

commit;
