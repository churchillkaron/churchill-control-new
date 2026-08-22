begin;

alter table public.bank_statements
  add column if not exists statement_import_id uuid,
  add column if not exists statement_line_number integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bank_statements_statement_import_fk'
      and conrelid = 'public.bank_statements'::regclass
  ) then
    alter table public.bank_statements
      add constraint bank_statements_statement_import_fk
      foreign key (statement_import_id)
      references public.finance_bank_statement_imports(id)
      on delete cascade;
  end if;
end $$;

create index if not exists bank_statements_import_line_idx
  on public.bank_statements (organization_id, entity_id, statement_import_id, statement_line_number);

create unique index if not exists finance_bank_statement_imports_scope_number_uidx
  on public.finance_bank_statement_imports (
    organization_id,
    entity_id,
    bank_account_id,
    statement_number
  );

create or replace function public.create_finance_bank_statement_import(
  p_organization_id uuid,
  p_entity_id uuid,
  p_bank_account_id uuid,
  p_statement_number text,
  p_statement_start_date date,
  p_statement_end_date date,
  p_opening_balance numeric,
  p_closing_balance numeric,
  p_currency_code text,
  p_import_reference text default null,
  p_created_by uuid default null,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import public.finance_bank_statement_imports%rowtype;
  v_bank_account record;
  v_line jsonb;
  v_line_number integer;
  v_transaction_date date;
  v_amount numeric;
  v_direction text;
  v_period_id uuid;
  v_line_count integer := 0;
  v_currency text;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;
  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;
  if p_bank_account_id is null then
    raise exception 'bank_account_id required';
  end if;
  if nullif(btrim(p_statement_number), '') is null then
    raise exception 'statement_number required';
  end if;
  if p_statement_start_date is null or p_statement_end_date is null then
    raise exception 'statement dates required';
  end if;
  if p_statement_start_date > p_statement_end_date then
    raise exception 'statement_start_date must not be after statement_end_date';
  end if;
  if p_opening_balance is null or p_closing_balance is null then
    raise exception 'opening_balance and closing_balance required';
  end if;
  if nullif(btrim(p_currency_code), '') is null then
    raise exception 'currency_code required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'lines must be an array';
  end if;

  select id, organization_id, entity_id, active, currency_code, currency
  into v_bank_account
  from public.bank_accounts
  where id = p_bank_account_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if not found then
    raise exception 'Bank account not found in selected organisation and legal entity';
  end if;
  if v_bank_account.active is false then
    raise exception 'Bank account is inactive';
  end if;

  v_currency := upper(btrim(p_currency_code));
  if nullif(btrim(coalesce(v_bank_account.currency_code, v_bank_account.currency)), '') is not null
     and upper(btrim(coalesce(v_bank_account.currency_code, v_bank_account.currency))) <> v_currency then
    raise exception 'Statement currency does not match bank account currency';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':' ||
      p_bank_account_id::text || ':bank-statement:' || upper(btrim(p_statement_number)),
      0
    )
  );

  if exists (
    select 1
    from public.finance_bank_statement_imports
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and bank_account_id = p_bank_account_id
      and statement_number = btrim(p_statement_number)
  ) then
    raise exception 'Bank statement number already imported for this account';
  end if;

  insert into public.finance_bank_statement_imports (
    organization_id,
    entity_id,
    bank_account_id,
    statement_number,
    statement_start_date,
    statement_end_date,
    opening_balance,
    closing_balance,
    currency_code,
    source_file_url,
    import_reference,
    status,
    created_by,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_bank_account_id,
    btrim(p_statement_number),
    p_statement_start_date,
    p_statement_end_date,
    p_opening_balance,
    p_closing_balance,
    v_currency,
    null,
    nullif(btrim(p_import_reference), ''),
    'IMPORTED',
    p_created_by,
    now()
  )
  returning * into v_import;

  for v_line, v_line_number in
    select value, ordinality::integer
    from jsonb_array_elements(p_lines) with ordinality
  loop
    begin
      v_transaction_date := nullif(btrim(v_line->>'transaction_date'), '')::date;
    exception when others then
      raise exception 'Bank statement line % has an invalid transaction_date', v_line_number;
    end;

    if v_transaction_date is null then
      raise exception 'Bank statement line % requires transaction_date', v_line_number;
    end if;
    if v_transaction_date < p_statement_start_date or v_transaction_date > p_statement_end_date then
      raise exception 'Bank statement line % transaction_date is outside the statement period', v_line_number;
    end if;

    begin
      v_amount := nullif(btrim(v_line->>'amount'), '')::numeric;
    exception when others then
      raise exception 'Bank statement line % has an invalid amount', v_line_number;
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Bank statement line % amount must be greater than zero', v_line_number;
    end if;

    v_direction := upper(btrim(coalesce(v_line->>'direction', '')));
    if v_direction not in ('IN', 'OUT') then
      raise exception 'Bank statement line % direction must be IN or OUT', v_line_number;
    end if;

    select ap.id
    into v_period_id
    from public.accounting_periods ap
    where ap.organization_id = p_organization_id
      and (ap.entity_id = p_entity_id or ap.entity_id is null)
      and ap.start_date <= v_transaction_date
      and ap.end_date >= v_transaction_date
    order by
      case when ap.entity_id = p_entity_id then 0 else 1 end,
      case when upper(coalesce(ap.status, '')) = 'OPEN' then 0 else 1 end,
      ap.start_date desc
    limit 1;

    insert into public.bank_statements (
      organization_id,
      entity_id,
      period_id,
      bank_account_id,
      statement_import_id,
      statement_line_number,
      transaction_date,
      description,
      amount,
      direction,
      reference_number,
      matched,
      created_at
    ) values (
      p_organization_id,
      p_entity_id,
      v_period_id,
      p_bank_account_id,
      v_import.id,
      v_line_number,
      v_transaction_date,
      nullif(btrim(v_line->>'description'), ''),
      v_amount,
      v_direction,
      nullif(btrim(v_line->>'reference_number'), ''),
      false,
      now()
    );

    v_line_count := v_line_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'record', to_jsonb(v_import),
    'statement_import_id', v_import.id,
    'line_count', v_line_count
  );
end;
$$;

revoke all on function public.create_finance_bank_statement_import(uuid,uuid,uuid,text,date,date,numeric,numeric,text,text,uuid,jsonb) from public;
revoke all on function public.create_finance_bank_statement_import(uuid,uuid,uuid,text,date,date,numeric,numeric,text,text,uuid,jsonb) from anon;
revoke all on function public.create_finance_bank_statement_import(uuid,uuid,uuid,text,date,date,numeric,numeric,text,text,uuid,jsonb) from authenticated;
grant execute on function public.create_finance_bank_statement_import(uuid,uuid,uuid,text,date,date,numeric,numeric,text,text,uuid,jsonb) to service_role;

commit;
